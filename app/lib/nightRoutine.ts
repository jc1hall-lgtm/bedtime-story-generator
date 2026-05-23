import { Audio } from "expo-av";

let musicSound: Audio.Sound | null = null;
let narrationSound: Audio.Sound | null = null;

export async function startBackgroundMusic(uri: string) {
  if (musicSound) {
    await musicSound.unloadAsync();
  }

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    {
      shouldPlay: true,
      isLooping: true,
      volume: 0.35,
    }
  );

  musicSound = sound;
}

export async function playNarration(uri: string) {
  if (narrationSound) {
    await narrationSound.unloadAsync();
  }

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true }
  );

  narrationSound = sound;

  return sound;
}

export async function fadeMusic(duration = 5000) {
  if (!musicSound) return;

  const steps = 20;
  const stepTime = duration / steps;

  for (let i = steps; i >= 0; i--) {
    await musicSound.setVolumeAsync(i / steps);
    await new Promise((r) => setTimeout(r, stepTime));
  }

  await musicSound.stopAsync();
}

export async function stopAllAudio() {
  if (musicSound) {
    await musicSound.stopAsync();
    await musicSound.unloadAsync();
    musicSound = null;
  }

  if (narrationSound) {
    await narrationSound.stopAsync();
    await narrationSound.unloadAsync();
    narrationSound = null;
  }
}