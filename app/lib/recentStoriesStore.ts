import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "recentStories.v1";
const MAX_RECENTS = 10;

export type RecentStory = {
  id: string;
  createdAt: number;
  title: string;
  story: string;
  meta?: any;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function loadAll(): Promise<RecentStory[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const items = safeJsonParse<RecentStory[]>(raw, []);
    return items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } catch {
    return [];
  }
}

async function saveAll(items: RecentStory[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // best effort
  }
}

export function useRecentStories() {
  const [items, setItems] = useState<RecentStory[]>([]);
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

  async function addRecent(story: RecentStory) {
    const current = await loadAll();

    const normalized: RecentStory = {
      ...story,
      createdAt: story.createdAt ?? Date.now(),
    };

    const next = [normalized, ...current.filter((x) => x.id !== normalized.id)]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, MAX_RECENTS);

    await saveAll(next);
    setItems(next);
  }

  async function clear() {
    await saveAll([]);
    setItems([]);
  }

  return {
    isReady,
    items,
    refresh,
    addRecent,
    clear,
  };
}