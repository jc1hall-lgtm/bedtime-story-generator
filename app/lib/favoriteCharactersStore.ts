import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

const KEY = "favoriteCharacters.v1";

export type FavoriteCharacter = {
  id: string;
  createdAt: number;
  childName: string;
  type: string;
  trait: string;
  item?: string;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function loadAll(): Promise<FavoriteCharacter[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return safeJsonParse<FavoriteCharacter[]>(raw, []);
}

async function saveAll(items: FavoriteCharacter[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export function useFavoriteCharacters() {
  const [items, setItems] = useState<FavoriteCharacter[]>([]);
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

  async function add(character: FavoriteCharacter) {
    const current = await loadAll();
    const next = [character, ...current.filter((x) => x.id !== character.id)];
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