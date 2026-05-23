import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "storyCount.v1";

type StoryCountData = {
  total: number;
  hasPrompted: boolean;
  firstOpenDate: string;
};

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function loadData(): Promise<StoryCountData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      const initial: StoryCountData = {
        total: 0,
        hasPrompted: false,
        firstOpenDate: todayString(),
      };
      await AsyncStorage.setItem(KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<StoryCountData>;
    return {
      total: typeof parsed.total === "number" ? parsed.total : 0,
      hasPrompted: typeof parsed.hasPrompted === "boolean" ? parsed.hasPrompted : false,
      firstOpenDate: typeof parsed.firstOpenDate === "string" ? parsed.firstOpenDate : todayString(),
    };
  } catch {
    return { total: 0, hasPrompted: false, firstOpenDate: todayString() };
  }
}

async function saveData(data: StoryCountData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // best effort
  }
}

export async function getStoryCountData(): Promise<StoryCountData> {
  return loadData();
}

export async function incrementStoryCount(): Promise<void> {
  const data = await loadData();
  await saveData({ ...data, total: data.total + 1 });
}

export async function markPrompted(): Promise<void> {
  const data = await loadData();
  await saveData({ ...data, hasPrompted: true });
}

export async function shouldRequestReview(): Promise<boolean> {
  const data = await loadData();
  const today = todayString();
  return data.total >= 3 && !data.hasPrompted && today !== data.firstOpenDate;
}
