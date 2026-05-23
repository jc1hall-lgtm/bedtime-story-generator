import {
    fadeMusic,
    playNarration,
    startBackgroundMusic,
} from "./nightRoutine";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runNightRoutine({
  narrationUri,
  questionUri,
  musicUri,
  sleepTimerMinutes = 15,
}: {
  narrationUri: string;
  questionUri?: string;
  musicUri: string;
  sleepTimerMinutes?: number;
}) {
  // 1️⃣ Start soft music
  await startBackgroundMusic(musicUri);

  await sleep(1000);

  // 2️⃣ Narrate story
  const narration = await playNarration(narrationUri);

  await new Promise<void>((resolve) => {
    narration.setOnPlaybackStatusUpdate((status: any) => {
      if (status.didJustFinish) resolve();
    });
  });

  // 3️⃣ Wind-down questions
  if (questionUri) {
    const questions = await playNarration(questionUri);

    await new Promise<void>((resolve) => {
      questions.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) resolve();
      });
    });
  }

  // 4️⃣ Fade music
  await fadeMusic(6000);

  // 5️⃣ Sleep timer
  await sleep(sleepTimerMinutes * 60 * 1000);
}