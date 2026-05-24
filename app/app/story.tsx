import { Buffer } from "buffer";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_BASE_URL } from "../lib/api";
import { useFavorites } from "../lib/favoritesStore";
import { useStorySeries } from "../lib/storySeriesStore";
import { useStoryStore } from "../lib/storyStore";
import { BedtimeTheme } from "../lib/theme";

const MOON_IMAGE = require("../assets/images/moon.png");
const STARS_IMAGE = require("../assets/images/stars.png");
const SLEEP_BED_SOUND = require("../assets/sounds/soft-music.mp3");

const BED_BASE_VOLUME = 0.18;
const BED_DUCK_VOLUME = 0.1;
const BED_FADE_MS = 1600;
const AUTO_SLEEP_SECONDS = 20;
const CHUNK_TIMEOUT_MS = 30000;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function safeUnload(sound: Audio.Sound | null) {
  if (!sound) return;
  try {
    await sound.stopAsync();
  } catch {}
  try {
    await sound.unloadAsync();
  } catch {}
}

type NarrationChunk = {
  id: string;
  text: string;
};

export default function StoryScreen() {
  const { story, setStory, clearStory } = useStoryStore();
  const { isReady, ids, add, remove } = useFavorites();
  const { upsertSeries } = useStorySeries();

  const [isNarrating, setIsNarrating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  const narrationRef = useRef<Audio.Sound | null>(null);
  const bedRef = useRef<Audio.Sound | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRequestedRef = useRef(false);
  const narrationRunIdRef = useRef(0);
  const chunkCacheRef = useRef<Map<string, string>>(new Map());

  const storyId = useMemo(() => {
    const t = story?.title ?? "";
    const c = story?.meta?.childName ?? "";
    const th = story?.meta?.theme ?? "";
    const len = story?.meta?.length ?? "";
    return `${c}|${th}|${len}|${t}`.trim().toLowerCase();
  }, [story]);

  const isFavorite = isReady && !!story && ids.has(storyId);

  const canContinueAdventure =
    !!story?.meta?.series?.id &&
    !!story?.meta?.childName &&
    !!story?.meta?.theme &&
    !!story?.meta?.length;

  const storyTextPretty = useMemo(() => {
    const raw = story?.story ?? "";
    return raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }, [story]);

  const narrationChunks = useMemo<NarrationChunk[]>(() => {
    if (!story) return [];

    const title = story.title?.trim() ?? "";
    const rawStory = storyTextPretty ?? "";

    const paragraphs = rawStory
      .split("\n\n")
      .map((p) => p.trim())
      .filter(Boolean);

    const chunks: NarrationChunk[] = [];

    if (title) {
      chunks.push({
        id: "title",
        text: title,
      });
    }

    paragraphs.forEach((paragraph, index) => {
      let text = paragraph;

      // Add a little extra pause cue after "The End."
      if (/^The End\.$/i.test(paragraph.trim())) {
        text = "The End.";
      }

      chunks.push({
        id: `p-${index}`,
        text,
      });
    });

    return chunks;
  }, [story, storyTextPretty]);

  async function toggleFavorite() {
    if (!story || !isReady) return;

    if (isFavorite) {
      await remove(storyId);
      return;
    }

    await add({
      id: storyId,
      createdAt: Date.now(),
      title: story.title,
      story: story.story,
      meta: story.meta ?? {},
    });
  }

  async function fadeTo(sound: Audio.Sound, to: number, duration: number) {
    const steps = 20;
    const step = duration / steps;

    const status: any = await sound.getStatusAsync();
    if (!status?.isLoaded) return;
    const from = typeof status.volume === "number" ? status.volume : to;

    for (let i = 0; i <= steps; i++) {
      const v = from + (to - from) * (i / steps);
      try {
        await sound.setVolumeAsync(v);
      } catch {
        break;
      }
      await sleep(step);
    }
  }

  function clearFadeTimer() {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }

  async function ensureBedSound() {
    clearFadeTimer();

    if (bedRef.current) {
      const s: any = await bedRef.current.getStatusAsync();
      if (!s.isPlaying) await bedRef.current.playAsync();
      await fadeTo(bedRef.current, BED_BASE_VOLUME, 600);
      return;
    }

    const { sound } = await Audio.Sound.createAsync(SLEEP_BED_SOUND, {
      shouldPlay: true,
      isLooping: true,
      volume: 0,
    });

    bedRef.current = sound;
    await fadeTo(sound, BED_BASE_VOLUME, BED_FADE_MS);
  }

  async function duckBedSound() {
    if (!bedRef.current) return;
    await fadeTo(bedRef.current, BED_DUCK_VOLUME, 350);
  }

  async function fadeOutBedSoundLater() {
    clearFadeTimer();

    fadeTimerRef.current = setTimeout(async () => {
      if (!bedRef.current) return;
      await fadeTo(bedRef.current, 0, BED_FADE_MS);
      await safeUnload(bedRef.current);
      bedRef.current = null;
    }, AUTO_SLEEP_SECONDS * 1000);
  }

  async function stopNarration() {
    stopRequestedRef.current = true;
    narrationRunIdRef.current += 1;

    if (!narrationRef.current) {
      setIsNarrating(false);
      return;
    }

    await safeUnload(narrationRef.current);
    narrationRef.current = null;
    setIsNarrating(false);
  }

  async function stopAllAudio() {
    clearFadeTimer();
    setIsLoading(false);
    await stopNarration();
    await safeUnload(bedRef.current);
    bedRef.current = null;
  }

  async function fetchNarrationChunk(
    chunk: NarrationChunk,
    voice: string
  ): Promise<string> {
    const cacheKey = `${voice}|${chunk.id}|${chunk.text}`;
    const cached = chunkCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

    try {
      const resp = await fetch(`${API_BASE_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chunk.text,
          voice,
          format: "mp3",
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(`TTS failed (${resp.status}): ${msg}`);
      }

      const tmpFile =
        (FileSystem.cacheDirectory || "") +
        `narration-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;

      const audioData = await resp.arrayBuffer();

      await FileSystem.writeAsStringAsync(
        tmpFile,
        Buffer.from(audioData).toString("base64"),
        { encoding: "base64" }
      );

      chunkCacheRef.current.set(cacheKey, tmpFile);
      return tmpFile;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function playSingleChunk(uri: string, runId: number) {
    if (runId !== narrationRunIdRef.current || stopRequestedRef.current) return;

    await safeUnload(narrationRef.current);

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true }
    );

    narrationRef.current = sound;

    await new Promise<void>((resolve, reject) => {
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status?.isLoaded) {
          if (status?.error) reject(new Error(status.error));
          return;
        }

        if (status.didJustFinish) {
          resolve();
        }
      });
    });

    if (runId === narrationRunIdRef.current) {
      await safeUnload(sound);
      if (narrationRef.current === sound) {
        narrationRef.current = null;
      }
    }
  }

  async function playNarration() {
    if (!story || isLoading || narrationChunks.length === 0) return;

    stopRequestedRef.current = false;
    narrationRunIdRef.current += 1;
    const runId = narrationRunIdRef.current;

    await stopNarration();
    stopRequestedRef.current = false;
    narrationRunIdRef.current = runId;

    await ensureBedSound();
    await duckBedSound();

    setIsLoading(true);
    setIsNarrating(true);

    try {
      const voice = story?.meta?.readerVoice ?? "shimmer";

      let nextChunkPromise: Promise<string> | null = null;

      for (let i = 0; i < narrationChunks.length; i++) {
        if (runId !== narrationRunIdRef.current || stopRequestedRef.current) {
          return;
        }

        const currentChunk = narrationChunks[i];
        const nextChunk = narrationChunks[i + 1];

        let currentUri: string;

        if (nextChunkPromise && i > 0) {
          currentUri = await nextChunkPromise;
          nextChunkPromise = null;
        } else {
          currentUri = await fetchNarrationChunk(currentChunk, voice);
        }

        if (nextChunk) {
          nextChunkPromise = fetchNarrationChunk(nextChunk, voice);
        }

        if (runId !== narrationRunIdRef.current || stopRequestedRef.current) {
          return;
        }

        await playSingleChunk(currentUri, runId);

        if (runId !== narrationRunIdRef.current || stopRequestedRef.current) {
          return;
        }

        // Natural pauses between chunks
        if (currentChunk.id === "title") {
          await sleep(900);
        } else if (/^The End\.$/i.test(currentChunk.text.trim())) {
          await sleep(1200);
        } else {
          await sleep(600);
        }
      }

      if (runId === narrationRunIdRef.current && !stopRequestedRef.current) {
        setIsNarrating(false);
        await fadeOutBedSoundLater();
      }
    } catch (e: any) {
      setIsNarrating(false);

      const message =
        e?.name === "AbortError"
          ? "Narration is taking too long. Please try again."
          : e?.message || "Unable to play narration.";

      Alert.alert("Narration error", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Retry", onPress: playNarration },
      ]);
    } finally {
      if (runId === narrationRunIdRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function handleContinueAdventure() {
    if (!story || isContinuing) return;

    const childName = String(story.meta?.childName ?? "").trim();
    const ageGroup = String(story.meta?.age ?? "3-5");
    const theme = String(story.meta?.theme ?? "Animals");
    const length = String(story.meta?.length ?? "Short");
    const pronounsMode = String(story.meta?.pronounsMode ?? "neutral");
    const readerVoice = String(story.meta?.readerVoice ?? "shimmer");
    const calmStoryType = String(
      story.meta?.calmStoryType ?? "Relaxing Story"
    );

    const character = {
      type: String(story.meta?.character?.type ?? "Explorer"),
      trait: String(story.meta?.character?.trait ?? "Curious"),
      item: String(story.meta?.character?.item ?? ""),
    };

    const series = story.meta?.series;

    if (!childName || !series?.id) {
      Alert.alert(
        "Unable to continue",
        "This story does not have a saved adventure series yet."
      );
      return;
    }

    setIsContinuing(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const resp = await fetch(`${API_BASE_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName,
          ageGroup,
          theme,
          length,
          pronounsMode,
          customTheme: "",
          readerVoice,
          calmStoryType,
          character,
          continueAdventure: true,
          storySeries: {
            id: series.id,
            latestEpisodeNumber: series.episodeNumber,
            latestSummary: series.latestSummary,
            episodes: Array.isArray(series.episodes)
              ? series.episodes.slice(-5).map((ep: any) => ({
                  title: ep.title,
                  story: ep.story,
                  summary: ep.summary ?? ep.episodeSummary ?? "",
                  episodeSummary: ep.episodeSummary ?? ep.summary ?? "",
                  storyEngine: ep.storyEngine,
                  settingSeed: ep.settingSeed,
                  openingStyle: ep.openingStyle,
                  wonderSeed: ep.wonderSeed,
                  companionSeed: ep.companionSeed,
                }))
              : [],
          },
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(`Generate failed (${resp.status}): ${msg}`);
      }

      const data = await resp.json();

      const nextEpisodeSummary =
        typeof data?.episodeSummary === "string" && data.episodeSummary.trim()
          ? data.episodeSummary.trim()
          : "";

      const updatedSeries = await upsertSeries(
        {
          id: series.id,
          childName,
          theme,
          characterType: character.type,
          characterTrait: character.trait,
          characterItem: character.item,
          pronounsMode,
          age: ageGroup,
          length,
          readerVoice,
          calmStoryType,
        },
        {
          title: data.title,
          story: data.story,
          summary: nextEpisodeSummary,
          episodeSummary: nextEpisodeSummary,
          storyEngine: data?.meta?.storyEngine,
          settingSeed: data?.meta?.settingSeed,
          openingStyle: data?.meta?.openingStyle,
          wonderSeed: data?.meta?.wonderSeed,
          companionSeed: data?.meta?.companionSeed,
        }
      );

      const updatedStory = {
        title: data.title,
        story: data.story,
        meta: {
          ...story.meta,
          character,
          storyEngine: data?.meta?.storyEngine,
          settingSeed: data?.meta?.settingSeed,
          openingStyle: data?.meta?.openingStyle,
          wonderSeed: data?.meta?.wonderSeed,
          companionSeed: data?.meta?.companionSeed,
          series: {
            id: updatedSeries.id,
            episodeNumber: updatedSeries.latestEpisodeNumber,
            latestSummary: updatedSeries.latestSummary,
            episodes: updatedSeries.episodes,
          },
        },
      };

      setStory(updatedStory);
    } catch (e: any) {
      const message =
        e?.name === "AbortError"
          ? "The next adventure is taking too long. Please try again."
          : e?.message || "Unable to continue the adventure.";

      Alert.alert("Adventure error", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Retry", onPress: handleContinueAdventure },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setIsContinuing(false);
    }
  }

  async function handleCreateAnotherStory() {
    await stopAllAudio();
    clearStory();
    router.replace("/");
  }

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});

    return () => {
      clearFadeTimer();
      void stopNarration();
      void safeUnload(bedRef.current);
      for (const uri of chunkCacheRef.current.values()) {
        void FileSystem.deleteAsync(uri, { idempotent: true });
      }
      chunkCacheRef.current.clear();
    };
  }, []);

  if (!story) {
    return (
      <LinearGradient
        colors={[
          BedtimeTheme.colors.bgTop,
          BedtimeTheme.colors.bgMid,
          BedtimeTheme.colors.bgBottom,
        ]}
        style={{ flex: 1 }}
      >
        <Image
          source={STARS_IMAGE}
          style={styles.stars}
          resizeMode="cover"
          pointerEvents="none"
        />
        <Image
          source={MOON_IMAGE}
          style={styles.moon}
          resizeMode="contain"
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safe}>
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No story yet</Text>
            <Text style={styles.emptyText}>Go back and generate one.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const metaParts = [
    story.meta?.childName ? String(story.meta.childName) : null,
    story.meta?.age ? String(story.meta.age) : null,
    story.meta?.theme ? String(story.meta.theme) : null,
    story.meta?.length ? String(story.meta.length) : null,
  ].filter(Boolean) as string[];

  return (
    <LinearGradient
      colors={[
        BedtimeTheme.colors.bgTop,
        BedtimeTheme.colors.bgMid,
        BedtimeTheme.colors.bgBottom,
      ]}
      style={styles.bg}
    >
      <Image
        source={STARS_IMAGE}
        style={styles.stars}
        resizeMode="cover"
        pointerEvents="none"
      />

      <Image
        source={MOON_IMAGE}
        style={styles.moon}
        resizeMode="contain"
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.audioCard}>
            <View style={styles.audioCardHeader}>
              <View style={styles.audioCardTitles}>
                <Text style={styles.audioTitle}>
                  Read it yourself or play narration
                </Text>
                <Text style={styles.audioHelper}>
                  The app can narrate the story with a soft bedtime sound in the
                  background.
                </Text>
              </View>
              <Pressable
                onPress={toggleFavorite}
                disabled={!isReady}
                style={({ pressed }) => [
                  styles.starBtn,
                  !isReady && styles.disabledBtn,
                  pressed && isReady && styles.pressed,
                ]}
              >
                <Text style={[styles.starIcon, isFavorite && styles.starIconActive]}>
                  {isFavorite ? "★" : "☆"}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={playNarration}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.primaryBtn,
                isLoading && styles.disabledBtn,
                pressed && !isLoading && styles.pressed,
              ]}
            >
              <Text style={styles.primaryText}>
                {isLoading
                  ? "Preparing narration…"
                  : isNarrating
                    ? "Restart narration ▶️"
                    : "Play narration ▶️"}
              </Text>
            </Pressable>

            <View style={styles.audioActions}>
              <Pressable
                onPress={stopAllAudio}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryText}>Stop audio ⏹</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.storyCard}>
            <Text style={styles.title}>{story.title}</Text>

            {metaParts.length ? (
              <Text style={styles.meta}>{metaParts.join(" • ")}</Text>
            ) : null}

            {storyTextPretty.split("\n\n").map((p, i) => (
              <Text key={i} style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>

          {canContinueAdventure ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Continue the adventure</Text>
              <Text style={styles.continueText}>
                Tip: You can continue this adventure tomorrow if your child
                wants the next part.
              </Text>

              <Pressable
                onPress={handleContinueAdventure}
                disabled={isContinuing}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  isContinuing && styles.disabledBtn,
                  pressed && !isContinuing && styles.pressed,
                ]}
              >
                <Text style={styles.primaryText}>
                  {isContinuing
                    ? "Creating next episode…"
                    : "✨ Continue Adventure"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Pressable
              onPress={handleCreateAnotherStory}
              style={({ pressed }) => [
                styles.secondaryActionBtnLarge,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryActionTextLarge}>
                Create another story
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 8 },
  container: { paddingBottom: 34 },

  stars: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.14,
  },
  moon: {
    position: "absolute",
    top: -18,
    right: -14,
    width: 210,
    height: 210,
    opacity: 0.5,
    transform: [{ rotate: "-6deg" }],
  },

  audioCard: {
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 14,
    marginBottom: 14,
    ...BedtimeTheme.shadow.card,
  },
  audioCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  audioCardTitles: {
    flex: 1,
    marginRight: 10,
  },
  audioTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  audioHelper: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  starBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  starIcon: {
    fontSize: 24,
    color: BedtimeTheme.colors.textMuted,
  },
  starIconActive: {
    color: BedtimeTheme.colors.accent,
  },
  audioActions: {
    flexDirection: "row",
    marginTop: 10,
  },

  storyCard: {
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 16,
    marginBottom: 14,
    ...BedtimeTheme.shadow.card,
  },
  title: {
    color: BedtimeTheme.colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 6,
  },
  meta: {
    color: BedtimeTheme.colors.textMuted,
    fontWeight: "700",
    marginBottom: 14,
  },
  paragraph: {
    color: BedtimeTheme.colors.text,
    fontSize: 17,
    lineHeight: 26,
    marginBottom: 12,
    fontWeight: "600",
  },

  card: {
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 16,
    marginBottom: 14,
    ...BedtimeTheme.shadow.card,
  },
  sectionTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },
  continueText: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: BedtimeTheme.colors.button,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryText: {
    color: BedtimeTheme.colors.buttonText,
    fontWeight: "900",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 8,
  },

  secondaryBtn: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: BedtimeTheme.colors.text,
    fontWeight: "800",
  },

  secondaryActionBtnLarge: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryActionTextLarge: {
    color: BedtimeTheme.colors.text,
    fontWeight: "800",
    fontSize: 14,
  },

  disabledBtn: { opacity: 0.55 },
  pressed: { opacity: 0.9 },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  emptyText: {
    color: BedtimeTheme.colors.textMuted,
  },
});