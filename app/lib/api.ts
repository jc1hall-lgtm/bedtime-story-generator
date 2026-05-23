const url = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!url) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL is not set. Copy .env.example to .env and fill it in."
  );
}

export const API_BASE_URL = url.replace(/\/$/, "");
