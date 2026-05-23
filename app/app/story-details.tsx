import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/chip";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFavoriteCharacters } from "../lib/favoriteCharactersStore";
import { useRecentStories } from "../lib/recentStoriesStore";
import { buildSeriesId, useStorySeries } from "../lib/storySeriesStore";
import { API_BASE_URL } from "../lib/api";
import { useStoryStore } from "../lib/storyStore";
import { BedtimeTheme } from "../lib/theme";

type AgeGroup = "3-5" | "6-8" | "9-12";
type Length = "Short" | "Medium" | "Long";
type PronounsMode = "neutral" | "he" | "she" | "they";
type ReaderVoice = "shimmer" | "onyx";
type CharacterType =
  | "Explorer"
  | "Knight"
  | "Astronaut"
  | "Princess"
  | "Animal Friend"
  | "Robot"
  | "Wizard"
  | "Custom";
type CharacterTrait =
  | "Brave"
  | "Curious"
  | "Kind"
  | "Funny"
  | "Smart"
  | "Adventurous";

// Extended loading messages — the last two appear after ~20s to manage expectations.
const LOADING_MESSAGES = [
  "🌙 Creating your bedtime story...",
  "✨ Gathering magical ideas",
  "📖 Writing the adventure",
  "🎙 Preparing narration",
  "⏳ Almost there, just a moment more...",
  "🌟 Putting the finishing touches on your story...",
];

export default function StoryDetailsScreen() {
  const { draft, setStory } = useStoryStore();
  const { addRecent } = useRecentStories();
  const {
    isReady: favoriteCharactersReady,
    ids: favoriteCharacterIds,
    add: addFavoriteCharacter,
    remove: removeFavoriteCharacter,
  } = useFavoriteCharacters();
  const { upsertSeries } = useStorySeries();

  const [age, setAge] = useState<AgeGroup>("3-5");
  const [length, setLength] = useState<Length>("Short");
  const [lengthValue, setLengthValue] = useState(0);
  const [pronounsMode, setPronounsMode] = useState<PronounsMode>("neutral");
  const [readerVoice, setReaderVoice] = useState<ReaderVoice>("shimmer");

  const [characterType, setCharacterType] = useState<CharacterType>("Explorer");
  const [customCharacterType, setCustomCharacterType] = useState("");
  const [characterTrait, setCharacterTrait] = useState<CharacterTrait>("Curious");
  const [characterItem, setCharacterItem] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // ── Cancel in-flight request when the app is backgrounded ─────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        cancelledByBackgroundRef.current = true;
        abortControllerRef.current?.abort();
        setIsGenerating(false);
        setLoadingMessageIndex(0);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const mappedLength: Length =
      lengthValue <= 0.5 ? "Short" : lengthValue <= 1.5 ? "Medium" : "Long";
    setLength(mappedLength);
  }, [lengthValue]);

  useEffect(() => {
    if (!isGenerating) {
      setLoadingMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) =>
        Math.min(prev + 1, LOADING_MESSAGES.length - 1)
      );
    }, 1400);

    return () => clearInterval(interval);
  }, [isGenerating]);

  const resolvedCharacterType =
    characterType === "Custom"
      ? customCharacterType.trim() || "Adventurer"
      : characterType;

  const childName = draft?.childName?.trim() ?? "";
  const theme = draft?.theme ?? "Animals";
  const customTheme = draft?.customTheme ?? "";
  const calmStoryType = draft?.calmStoryType ?? "Relaxing Story";

  const resolvedTheme =
    theme === "Custom" ? customTheme.trim() || "Custom" : theme;

  // Normalise characterItem once so all usages are consistent.
  const trimmedCharacterItem = characterItem.trim();

  const characterId = useMemo(() => {
    return [
      childName.toLowerCase(),
      resolvedCharacterType.trim().toLowerCase(),
      characterTrait.trim().toLowerCase(),
      trimmedCharacterItem.toLowerCase(),
    ]
      .join("|")
      .trim();
  }, [childName, resolvedCharacterType, characterTrait, trimmedCharacterItem]);

  const seriesId = useMemo(
    () =>
      buildSeriesId({
        childName,
        theme: resolvedTheme,
        characterType: resolvedCharacterType,
        characterTrait,
        characterItem: trimmedCharacterItem,
      }),
    [childName, resolvedTheme, resolvedCharacterType, characterTrait, trimmedCharacterItem]
  );

  const isFavoriteCharacter =
    favoriteCharactersReady &&
    !!childName &&
    favoriteCharacterIds.has(characterId);

  // ── Favorite character ──────────────────────────────────────────────────────
  // isSavingFavorite prevents double-taps while the async op is in flight.
  const toggleFavoriteCharacter = useCallback(async () => {
    if (!favoriteCharactersReady || !childName || isSavingFavorite) return;

    setIsSavingFavorite(true);
    try {
      if (isFavoriteCharacter) {
        await removeFavoriteCharacter(characterId);
      } else {
        await addFavoriteCharacter({
          id: characterId,
          createdAt: Date.now(),
          childName,
          type: resolvedCharacterType,
          trait: characterTrait,
          item: trimmedCharacterItem,
        });
      }
    } finally {
      setIsSavingFavorite(false);
    }
  }, [
    favoriteCharactersReady,
    childName,
    isSavingFavorite,
    isFavoriteCharacter,
    characterId,
    resolvedCharacterType,
    characterTrait,
    trimmedCharacterItem,
    addFavoriteCharacter,
    removeFavoriteCharacter,
  ]);

  // ── Story generation ────────────────────────────────────────────────────────
  // useRef tracks whether a generation is in flight so handleGenerate can be
  // safely called from the Alert retry callback without stale closure issues.
  const isGeneratingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Set to true when the OS backgrounds the app mid-request so we can cancel
  // silently instead of showing an error alert the user didn't ask for.
  const cancelledByBackgroundRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (isGeneratingRef.current) return;

    if (!childName) {
      Alert.alert("Missing setup", "Please go back and enter the child's name.");
      return;
    }

    isGeneratingRef.current = true;
    cancelledByBackgroundRef.current = false;
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const resp = await fetch(`${API_BASE_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName,
          ageGroup: age,
          theme,
          length,
          pronounsMode,
          customTheme,
          readerVoice,
          calmStoryType,
          character: {
            type: resolvedCharacterType,
            trait: characterTrait,
            item: trimmedCharacterItem,
          },
          continueAdventure: false,
          storySeries: null,
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
          id: seriesId,
          childName,
          theme: resolvedTheme,
          characterType: resolvedCharacterType,
          characterTrait,
          characterItem: trimmedCharacterItem,
          pronounsMode,
          age,
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

      const storyPayload = {
        title: data.title,
        story: data.story,
        meta: {
          childName,
          age,
          theme: resolvedTheme,
          length,
          pronounsMode,
          readerVoice,
          calmStoryType,
          character: {
            type: resolvedCharacterType,
            trait: characterTrait,
            item: trimmedCharacterItem,
          },
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

      // Use a timestamp + random suffix so each story gets a unique recent ID,
      // even if the same child/theme/length/title combination is generated again.
      const recentId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      await addRecent({
        id: recentId,
        createdAt: Date.now(),
        title: storyPayload.title,
        story: storyPayload.story,
        meta: storyPayload.meta ?? {},
      });

      setStory(storyPayload);
      router.replace("/story");
    } catch (e: any) {
      if (!cancelledByBackgroundRef.current) {
        const message =
          e?.name === "AbortError"
            ? "The story is taking too long. Please try again."
            : e?.message || "Something went wrong. Please try again.";

        Alert.alert("Story error", message, [
          { text: "Cancel", style: "cancel" },
          { text: "Retry", onPress: handleGenerate },
        ]);
      }
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }, [
    childName,
    age,
    theme,
    length,
    pronounsMode,
    customTheme,
    readerVoice,
    calmStoryType,
    resolvedCharacterType,
    characterTrait,
    trimmedCharacterItem,
    seriesId,
    resolvedTheme,
    upsertSeries,
    addRecent,
    setStory,
  ]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <LinearGradient
        colors={[
          BedtimeTheme.colors.bgTop,
          BedtimeTheme.colors.bgMid,
          BedtimeTheme.colors.bgBottom,
        ]}
        style={styles.bg}
      >
        <Image
          source={require("../assets/images/stars.png")}
          style={styles.stars}
          resizeMode="cover"
          pointerEvents="none"
        />

        <Image
          source={require("../assets/images/moon.png")}
          style={styles.moon}
          resizeMode="contain"
          pointerEvents="none"
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.kicker}>Step 2 of 2</Text>
              <Text style={styles.title}>Personalize the story</Text>
              <Text style={styles.subtitle}>
                Fine-tune the character, voice, and story style before you
                generate it.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Character details</Text>

              <Text style={styles.label}>Character role</Text>
              <View style={styles.row}>
                {(
                  [
                    "Explorer",
                    "Knight",
                    "Astronaut",
                    "Princess",
                    "Animal Friend",
                    "Robot",
                    "Wizard",
                    "Custom",
                  ] as CharacterType[]
                ).map((t) => (
                  <Chip
                    key={t}
                    label={t === "Custom" ? "Custom…" : t}
                    selected={characterType === t}
                    onPress={() => setCharacterType(t)}
                  />
                ))}
              </View>

              {characterType === "Custom" ? (
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="e.g., dragon rider"
                  placeholderTextColor="rgba(242,245,255,0.45)"
                  value={customCharacterType}
                  onChangeText={setCustomCharacterType}
                  autoCorrect={false}
                  autoCapitalize="words"
                />
              ) : null}

              <Text style={[styles.label, { marginTop: 16 }]}>Personality</Text>
              <View style={styles.row}>
                {(
                  [
                    "Brave",
                    "Curious",
                    "Kind",
                    "Funny",
                    "Smart",
                    "Adventurous",
                  ] as CharacterTrait[]
                ).map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={characterTrait === t}
                    onPress={() => setCharacterTrait(t)}
                  />
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>
                Special item (optional)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., glowing lantern"
                placeholderTextColor="rgba(242,245,255,0.45)"
                value={characterItem}
                onChangeText={setCharacterItem}
                autoCorrect={false}
                autoCapitalize="sentences"
              />

              <Pressable
                onPress={toggleFavoriteCharacter}
                disabled={!favoriteCharactersReady || !childName || isSavingFavorite}
                style={({ pressed }) => [
                  styles.secondaryActionBtn,
                  (!favoriteCharactersReady || !childName || isSavingFavorite) &&
                    styles.disabledBtn,
                  pressed &&
                    favoriteCharactersReady &&
                    !!childName &&
                    !isSavingFavorite &&
                    styles.pressed,
                ]}
              >
                {isSavingFavorite ? (
                  <ActivityIndicator color={BedtimeTheme.colors.text} />
                ) : (
                  <Text style={styles.secondaryActionText}>
                    {isFavoriteCharacter
                      ? "Remove Favorite Character ★"
                      : "Save Favorite Character ☆"}
                  </Text>
                )}
              </Pressable>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>Story settings</Text>

              <Text style={styles.label}>Pronouns</Text>
              <View style={styles.row}>
                <Chip
                  label="Neutral"
                  selected={pronounsMode === "neutral"}
                  onPress={() => setPronounsMode("neutral")}
                />
                <Chip
                  label="He/Him"
                  selected={pronounsMode === "he"}
                  onPress={() => setPronounsMode("he")}
                />
                <Chip
                  label="She/Her"
                  selected={pronounsMode === "she"}
                  onPress={() => setPronounsMode("she")}
                />
                <Chip
                  label="They/Them"
                  selected={pronounsMode === "they"}
                  onPress={() => setPronounsMode("they")}
                />
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Age</Text>
              <View style={styles.row}>
                <Chip
                  label="3–5"
                  selected={age === "3-5"}
                  onPress={() => setAge("3-5")}
                />
                <Chip
                  label="6–8"
                  selected={age === "6-8"}
                  onPress={() => setAge("6-8")}
                />
                <Chip
                  label="9–12"
                  selected={age === "9-12"}
                  onPress={() => setAge("9-12")}
                />
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Story length</Text>
              <View style={styles.sliderWrap}>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={2}
                  step={1}
                  value={lengthValue}
                  onValueChange={setLengthValue}
                  minimumTrackTintColor={BedtimeTheme.colors.button}
                  maximumTrackTintColor="rgba(255,255,255,0.22)"
                  thumbTintColor={BedtimeTheme.colors.text}
                />
                <View style={styles.sliderLabels}>
                  <Pressable
                    onPress={() => setLengthValue(0)}
                    style={styles.sliderLabelBtn}
                  >
                    <Text
                      style={[
                        styles.sliderLabel,
                        length === "Short" && styles.sliderLabelActive,
                      ]}
                    >
                      Short
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLengthValue(1)}
                    style={styles.sliderLabelBtn}
                  >
                    <Text
                      style={[
                        styles.sliderLabel,
                        length === "Medium" && styles.sliderLabelActive,
                      ]}
                    >
                      Medium
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLengthValue(2)}
                    style={styles.sliderLabelBtn}
                  >
                    <Text
                      style={[
                        styles.sliderLabel,
                        length === "Long" && styles.sliderLabelActive,
                      ]}
                    >
                      Long
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.lengthHint}>
                  Selected:{" "}
                  {length === "Short"
                    ? "Short • about 3 minutes"
                    : length === "Medium"
                      ? "Medium • about 5 minutes"
                      : "Long • about 8 minutes"}
                </Text>
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Reader voice</Text>
              <View style={styles.row}>
                <Chip
                  label="Female voice"
                  selected={readerVoice === "shimmer"}
                  onPress={() => setReaderVoice("shimmer")}
                />
                <Chip
                  label="Male voice"
                  selected={readerVoice === "onyx"}
                  onPress={() => setReaderVoice("onyx")}
                />
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => router.back()}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>

                <Pressable
                  onPress={handleGenerate}
                  disabled={isGenerating}
                  style={({ pressed }) => [
                    styles.primaryBtnInline,
                    isGenerating && styles.disabledBtn,
                    pressed && !isGenerating && styles.pressed,
                  ]}
                >
                  {isGenerating ? (
                    <ActivityIndicator color={BedtimeTheme.colors.buttonText} />
                  ) : (
                    <Text style={styles.primaryText}>Generate Story</Text>
                  )}
                </Pressable>
              </View>

              {isGenerating ? (
                <Text style={styles.loadingMessage}>
                  {LOADING_MESSAGES[loadingMessageIndex]}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BedtimeTheme.colors.bgTop,
  },
  bg: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 40,
  },
  stars: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.16,
  },
  moon: {
    position: "absolute",
    top: -14,
    right: -10,
    width: 210,
    height: 210,
    opacity: 0.55,
    transform: [{ rotate: "-6deg" }],
  },
  header: {
    paddingTop: 6,
    paddingBottom: 14,
  },
  kicker: {
    color: BedtimeTheme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  title: {
    color: BedtimeTheme.colors.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 6,
  },
  subtitle: {
    color: BedtimeTheme.colors.textMuted,
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    marginTop: 6,
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 16,
    ...BedtimeTheme.shadow.card,
  },
  sectionTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  label: {
    color: BedtimeTheme.colors.textMuted,
    fontWeight: "800",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: BedtimeTheme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: BedtimeTheme.colors.text,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginVertical: 14,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryActionBtn: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryActionText: {
    color: BedtimeTheme.colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  sliderWrap: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: BedtimeTheme.radius.lg,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sliderLabelBtn: {
    flex: 1,
    alignItems: "center",
  },
  sliderLabel: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  sliderLabelActive: {
    color: BedtimeTheme.colors.text,
  },
  lengthHint: {
    marginTop: 8,
    color: BedtimeTheme.colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  secondaryBtn: {
    minHeight: 52,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryText: {
    color: BedtimeTheme.colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  primaryBtnInline: {
    flex: 1,
    minHeight: 52,
    backgroundColor: BedtimeTheme.colors.button,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  primaryText: {
    color: BedtimeTheme.colors.buttonText,
    fontWeight: "900",
    fontSize: 16,
    textAlign: "center",
  },
  loadingMessage: {
    marginTop: 12,
    color: BedtimeTheme.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
});