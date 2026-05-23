import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "storySeries.v2";

export type StorySeriesEpisode = {
  episodeNumber: number;
  title: string;
  story: string;
  summary: string;
  episodeSummary?: string;
  storyEngine?: string;
  settingSeed?: string;
  openingStyle?: string;
  wonderSeed?: string;
  companionSeed?: string;
  createdAt: number;
};

export type StorySeriesEntry = {
  id: string;
  createdAt: number;
  updatedAt: number;
  childName: string;
  theme: string;
  characterType: string;
  characterTrait: string;
  characterItem?: string;
  pronounsMode?: string;
  age?: string;
  length?: string;
  readerVoice?: string;
  calmStoryType?: string;
  latestTitle: string;
  latestStory: string;
  latestEpisodeNumber: number;
  latestSummary: string;
  latestEpisodeSummary?: string;
  latestStoryEngine?: string;
  latestSettingSeed?: string;
  latestOpeningStyle?: string;
  latestWonderSeed?: string;
  latestCompanionSeed?: string;
  episodes: StorySeriesEpisode[];
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeLoadedEntry(entry: any): StorySeriesEntry {
  const episodes: StorySeriesEpisode[] = Array.isArray(entry?.episodes)
    ? entry.episodes.map((ep: any, index: number) => ({
        episodeNumber:
          typeof ep?.episodeNumber === "number" ? ep.episodeNumber : index + 1,
        title: String(ep?.title ?? ""),
        story: String(ep?.story ?? ""),
        summary: String(ep?.summary ?? ep?.episodeSummary ?? ""),
        episodeSummary:
          typeof ep?.episodeSummary === "string"
            ? ep.episodeSummary
            : typeof ep?.summary === "string"
              ? ep.summary
              : "",
        storyEngine:
          typeof ep?.storyEngine === "string" ? ep.storyEngine : undefined,
        settingSeed:
          typeof ep?.settingSeed === "string" ? ep.settingSeed : undefined,
        openingStyle:
          typeof ep?.openingStyle === "string" ? ep.openingStyle : undefined,
        wonderSeed:
          typeof ep?.wonderSeed === "string" ? ep.wonderSeed : undefined,
        companionSeed:
          typeof ep?.companionSeed === "string" ? ep.companionSeed : undefined,
        createdAt:
          typeof ep?.createdAt === "number" ? ep.createdAt : Date.now(),
      }))
    : [];

  return {
    id: String(entry?.id ?? ""),
    createdAt:
      typeof entry?.createdAt === "number" ? entry.createdAt : Date.now(),
    updatedAt:
      typeof entry?.updatedAt === "number" ? entry.updatedAt : Date.now(),
    childName: String(entry?.childName ?? ""),
    theme: String(entry?.theme ?? ""),
    characterType: String(entry?.characterType ?? ""),
    characterTrait: String(entry?.characterTrait ?? ""),
    characterItem:
      typeof entry?.characterItem === "string" ? entry.characterItem : "",
    pronounsMode:
      typeof entry?.pronounsMode === "string" ? entry.pronounsMode : undefined,
    age: typeof entry?.age === "string" ? entry.age : undefined,
    length: typeof entry?.length === "string" ? entry.length : undefined,
    readerVoice:
      typeof entry?.readerVoice === "string" ? entry.readerVoice : undefined,
    calmStoryType:
      typeof entry?.calmStoryType === "string"
        ? entry.calmStoryType
        : undefined,
    latestTitle: String(entry?.latestTitle ?? ""),
    latestStory: String(entry?.latestStory ?? ""),
    latestEpisodeNumber:
      typeof entry?.latestEpisodeNumber === "number"
        ? entry.latestEpisodeNumber
        : episodes.length || 1,
    latestSummary: String(
      entry?.latestSummary ?? entry?.latestEpisodeSummary ?? ""
    ),
    latestEpisodeSummary:
      typeof entry?.latestEpisodeSummary === "string"
        ? entry.latestEpisodeSummary
        : typeof entry?.latestSummary === "string"
          ? entry.latestSummary
          : "",
    latestStoryEngine:
      typeof entry?.latestStoryEngine === "string"
        ? entry.latestStoryEngine
        : undefined,
    latestSettingSeed:
      typeof entry?.latestSettingSeed === "string"
        ? entry.latestSettingSeed
        : undefined,
    latestOpeningStyle:
      typeof entry?.latestOpeningStyle === "string"
        ? entry.latestOpeningStyle
        : undefined,
    latestWonderSeed:
      typeof entry?.latestWonderSeed === "string"
        ? entry.latestWonderSeed
        : undefined,
    latestCompanionSeed:
      typeof entry?.latestCompanionSeed === "string"
        ? entry.latestCompanionSeed
        : undefined,
    episodes,
  };
}

async function loadAll(): Promise<StorySeriesEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  const parsed = safeJsonParse<any[]>(raw, []);
  return parsed.map(normalizeLoadedEntry);
}

async function saveAll(items: StorySeriesEntry[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export function buildSeriesId(input: {
  childName: string;
  theme: string;
  characterType: string;
  characterTrait: string;
  characterItem?: string;
}) {
  return [
    input.childName.trim().toLowerCase(),
    input.theme.trim().toLowerCase(),
    input.characterType.trim().toLowerCase(),
    input.characterTrait.trim().toLowerCase(),
    (input.characterItem || "").trim().toLowerCase(),
  ]
    .join("|")
    .trim();
}

export function useStorySeries() {
  const [items, setItems] = useState<StorySeriesEntry[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadAll();
      setItems(loaded);
      setIsReady(true);
    })();
  }, []);

  async function refresh() {
    const loaded = await loadAll();
    setItems(loaded);
    setIsReady(true);
  }

  async function upsertSeries(
    seriesBase: Omit<
      StorySeriesEntry,
      | "createdAt"
      | "updatedAt"
      | "latestTitle"
      | "latestStory"
      | "latestEpisodeNumber"
      | "latestSummary"
      | "latestEpisodeSummary"
      | "latestStoryEngine"
      | "latestSettingSeed"
      | "latestOpeningStyle"
      | "latestWonderSeed"
      | "latestCompanionSeed"
      | "episodes"
    >,
    episode: {
      title: string;
      story: string;
      summary: string;
      episodeSummary?: string;
      storyEngine?: string;
      settingSeed?: string;
      openingStyle?: string;
      wonderSeed?: string;
      companionSeed?: string;
    }
  ) {
    const current = await loadAll();
    const existing = current.find((x) => x.id === seriesBase.id);

    const nextEpisodeNumber = existing ? existing.latestEpisodeNumber + 1 : 1;

    const nextEpisode: StorySeriesEpisode = {
      episodeNumber: nextEpisodeNumber,
      title: episode.title,
      story: episode.story,
      summary: episode.summary,
      episodeSummary: episode.episodeSummary ?? episode.summary,
      storyEngine: episode.storyEngine,
      settingSeed: episode.settingSeed,
      openingStyle: episode.openingStyle,
      wonderSeed: episode.wonderSeed,
      companionSeed: episode.companionSeed,
      createdAt: Date.now(),
    };

    const updated: StorySeriesEntry = existing
      ? {
          ...existing,
          ...seriesBase,
          updatedAt: Date.now(),
          latestTitle: episode.title,
          latestStory: episode.story,
          latestEpisodeNumber: nextEpisodeNumber,
          latestSummary: episode.summary,
          latestEpisodeSummary: episode.episodeSummary ?? episode.summary,
          latestStoryEngine: episode.storyEngine,
          latestSettingSeed: episode.settingSeed,
          latestOpeningStyle: episode.openingStyle,
          latestWonderSeed: episode.wonderSeed,
          latestCompanionSeed: episode.companionSeed,
          episodes: [...existing.episodes, nextEpisode].slice(-20),
        }
      : {
          ...seriesBase,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          latestTitle: episode.title,
          latestStory: episode.story,
          latestEpisodeNumber: 1,
          latestSummary: episode.summary,
          latestEpisodeSummary: episode.episodeSummary ?? episode.summary,
          latestStoryEngine: episode.storyEngine,
          latestSettingSeed: episode.settingSeed,
          latestOpeningStyle: episode.openingStyle,
          latestWonderSeed: episode.wonderSeed,
          latestCompanionSeed: episode.companionSeed,
          episodes: [nextEpisode],
        };

    const next = [updated, ...current.filter((x) => x.id !== updated.id)].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );

    await saveAll(next);
    setItems(next);

    return updated;
  }

  async function clear() {
    await saveAll([]);
    setItems([]);
  }

  return {
    isReady,
    items,
    refresh,
    upsertSeries,
    clear,
  };
}