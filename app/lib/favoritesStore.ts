import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

const KEY = "favorites.v1";
const MAX_FAVORITES = 100;

export type FavoriteStory = {
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

async function loadAll(): Promise<FavoriteStory[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const items = safeJsonParse<FavoriteStory[]>(raw, []);
    // Ensure newest-first if any old data was unsorted
    return items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } catch {
    return [];
  }
}

async function saveAll(items: FavoriteStory[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore (best-effort persistence)
  }
}

export function useFavorites() {
  const [items, setItems] = useState<FavoriteStory[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadAll();
      setItems(loaded);
      setIsReady(true);
    })();
  }, []);

  const ids = useMemo(() => new Set(items.map((x) => x.id)), [items]);

  async function refresh() {
    const loaded = await loadAll();
    setItems(loaded);
    setIsReady(true);
  }

  async function add(fav: FavoriteStory) {
    const current = await loadAll();

    const normalized: FavoriteStory = {
      ...fav,
      createdAt: fav.createdAt ?? Date.now(),
    };

    // no duplicates + newest first
    const next = [normalized, ...current.filter((x) => x.id !== normalized.id)]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, MAX_FAVORITES);

    await saveAll(next);
    setItems(next);
  }

  async function remove(id: string) {
    const current = await loadAll();
    const next = current.filter((x) => x.id !== id);

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
    ids,
    refresh,
    add,
    remove,
    clear,
  };
}