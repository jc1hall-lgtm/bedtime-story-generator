import React, { createContext, useContext, useMemo, useState } from "react";

export type StoryDraft = {
  childName: string;
  theme: string;
  customTheme?: string;
  calmStoryType?: string;
};

export type StoryMeta = {
  childName: string;
  age: string;
  theme: string;
  length: string;
  pronounsMode?: "neutral" | "he" | "she" | "they";
  readerVoice?: "shimmer" | "onyx";
  calmStoryType?: string;
  character?: {
    type: string;
    trait: string;
    item?: string;
  };
  series?: {
    id: string;
    episodeNumber: number;
    latestSummary?: string;
    episodes?: any[];
  };
};

export type StoryPayload = {
  title: string;
  story: string;
  meta?: StoryMeta;
};

type StoryStore = {
  draft: StoryDraft | null;
  story: StoryPayload | null;
  setDraft: (draft: StoryDraft | null) => void;
  setStory: (story: StoryPayload | null) => void;
  clearStory: () => void;
};

const Ctx = createContext<StoryStore | null>(null);

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [story, setStory] = useState<StoryPayload | null>(null);

  const clearStory = () => setStory(null);

  const value = useMemo(
    () => ({
      draft,
      story,
      setDraft,
      setStory,
      clearStory,
    }),
    [draft, story]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStoryStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStoryStore must be used within StoryProvider");
  return ctx;
}