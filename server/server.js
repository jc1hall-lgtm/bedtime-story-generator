import { Buffer } from "buffer";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

// Import pre-generated fallback stories.
// Each entry shape: { theme, length, ageGroup, title, story, episodeSummary }
// Use [NAME] as the child name placeholder in title/story/episodeSummary fields.
import fallbackStories from "./fallbackStories.json" assert { type: "json" };

dotenv.config();

// ─── Startup validation ────────────────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY) {
  console.error("FATAL: OPENAI_API_KEY is not set.");
  process.exit(1);
}

const isDev = process.env.NODE_ENV !== "production";

const app = express();

// Trust the first proxy hop so req.ip works correctly behind common hosts.
app.set("trust proxy", 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((x) => x.trim()).filter(Boolean)
  : null;

app.use(cors({ origin: allowedOrigins ?? true }));
app.use(express.json({ limit: "50kb" }));

// ─── Rate limiting ─────────────────────────────────────────────────────────────

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please wait a moment before generating another story.",
  },
});

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many TTS requests. Please wait a moment." },
});

// ─── OpenAI client ─────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── Validation constants ──────────────────────────────────────────────────────

const VALID_AGE_GROUPS  = ["3-5", "6-8", "9-12"];
const VALID_LENGTHS     = ["Short", "Medium", "Long"];
const VALID_PRONOUNS    = ["neutral", "he", "she", "they"];
const VALID_VOICES      = ["shimmer", "onyx"];
const VALID_TTS_FORMATS = ["mp3", "opus", "aac", "flac", "pcm"];
const VALID_CALM_TYPES  = [
  "Relaxing Story",
  "Brave Story",
  "Breathing Story",
  "Gratitude Story",
];
const VALID_THEMES = [
  "Animals",
  "Space",
  "Dinosaurs",
  "Magic",
  "Ocean",
  "Forest",
  "Vehicles",
  "Friendship",
  "Custom",
];

const MAX_CHILD_NAME_LENGTH      = 50;
const MAX_CUSTOM_THEME_LENGTH    = 100;
const MAX_CHARACTER_FIELD_LENGTH = 100;
const MAX_TTS_TEXT_LENGTH        = 8000;

// Daily per-IP generation limit. In-memory only.
// Resets by UTC date key. Stale keys are pruned hourly by setInterval below.
const DAILY_GENERATION_LIMIT = 20;
const dailyCounts = new Map();

// ─── Utilities ─────────────────────────────────────────────────────────────────

function pickRandom(list, label = "list") {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`pickRandom received empty ${label}.`);
  }
  return list[Math.floor(Math.random() * list.length)];
}

function escapeRegExp(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFallbackEpisodeSummary(storyText = "", title = "") {
  const cleaned = String(storyText || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return title ? `${title}.` : "A gentle bedtime adventure.";
  return cleaned.slice(0, 220).trim() + (cleaned.length > 220 ? "..." : "");
}

function ensureEnding(storyText = "", childName = "") {
  const safeName = String(childName || "").trim() || "sweet one";

  const whispers = [
    `Sleep well, ${safeName}.`,
    `Sweet dreams, ${safeName}.`,
    `Rest well tonight, ${safeName}.`,
    `Dream beautifully, ${safeName}.`,
    `Goodnight, ${safeName}.`,
  ];

  const whisper = pickRandom(whispers, "whispers");
  let text = String(storyText || "").trim();

  text = text.replace(/\bThe End\.\s*/gi, "").trim();

  const whisperRegex = new RegExp(
    `(Sleep well|Sweet dreams|Rest well tonight|Dream beautifully|Goodnight),\\s*${escapeRegExp(safeName)}\\.\\s*`,
    "gi"
  );
  text = text.replace(whisperRegex, "").trim();

  return `${text}\n\nThe End.\n\n${whisper}`;
}

function resolvePronounInstruction(pronounsMode) {
  switch (pronounsMode) {
    case "neutral":
      return "Do NOT use gendered pronouns. Avoid he/she. Use the child's name or they/them.";
    case "he":
      return "Use he/him pronouns for the child.";
    case "she":
      return "Use she/her pronouns for the child.";
    case "they":
      return "Use they/them pronouns for the child.";
    default:
      console.warn(`Unrecognised pronounsMode "${pronounsMode}", falling back to neutral.`);
      return "Do NOT use gendered pronouns. Avoid he/she. Use the child's name or they/them.";
  }
}

function safeTruncate(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function getAudioContentType(format) {
  switch (format) {
    case "mp3":  return "audio/mpeg";
    case "opus": return "audio/ogg";
    case "aac":  return "audio/aac";
    case "flac": return "audio/flac";
    case "pcm":  return "audio/pcm";
    default:     return "application/octet-stream";
  }
}

// ─── Daily limit ───────────────────────────────────────────────────────────────

function getDailyKey(ip) {
  const today = new Date().toISOString().slice(0, 10); // "2026-04-12"
  return `${ip}::${today}`;
}

/**
 * Delete any Map entries whose date component is not today.
 * Called hourly via setInterval rather than on every request.
 */
function pruneDailyCounts() {
  const today = new Date().toISOString().slice(0, 10);
  for (const key of dailyCounts.keys()) {
    const [, date] = key.split("::");
    if (date !== today) dailyCounts.delete(key);
  }
}

// Prune stale daily-count entries once per hour.
setInterval(pruneDailyCounts, 60 * 60 * 1000);

function checkAndIncrementDailyLimit(ip) {
  const key = getDailyKey(ip);
  const count = dailyCounts.get(key) ?? 0;

  if (count >= DAILY_GENERATION_LIMIT) {
    const error = new Error(
      `Daily story limit of ${DAILY_GENERATION_LIMIT} reached. Please come back tomorrow.`
    );
    error.status = 429;
    throw error;
  }

  dailyCounts.set(key, count + 1);
}

// ─── Content moderation ────────────────────────────────────────────────────────

async function moderateInputs(fields) {
  const combined = fields.filter(Boolean).join("\n").trim();
  if (!combined) return;

  const result = await openai.moderations.create({ input: combined });
  const flagged = result.results?.[0]?.flagged;

  if (flagged) {
    const error = new Error("One or more inputs were flagged as inappropriate.");
    error.status = 400;
    throw error;
  }
}

// ─── Fallback story cache ──────────────────────────────────────────────────────

function getFallbackStory({
  childName,
  theme,
  length,
  ageGroup,
  pronounsMode = "neutral",
  readerVoice = "shimmer",
  calmStoryType = "Relaxing Story",
  character = { type: "Adventurer", trait: "Curious", item: "" },
}) {
  const candidates = fallbackStories.filter(
    (s) => s.theme === theme && s.length === length && s.ageGroup === ageGroup
  );

  const pool = candidates.length ? candidates : fallbackStories;
  const story = pickRandom(pool, "fallbackStories");

  const personalise = (text) => String(text || "").replace(/\[NAME\]/g, childName);

  const personalisedTitle   = personalise(story.title);
  const personalisedStory   = personalise(story.story);
  const personalisedSummary = personalise(story.episodeSummary);

  return {
    title: personalisedTitle,
    story: ensureEnding(personalisedStory, childName),
    episodeSummary:
      personalisedSummary ||
      buildFallbackEpisodeSummary(personalisedStory, personalisedTitle),
    fromCache: true,
    meta: {
      childName,
      age: ageGroup,
      theme,
      length,
      pronounsMode,
      readerVoice,
      calmStoryType,
      character: {
        type: character?.type || "Adventurer",
        trait: character?.trait || "Curious",
        item: character?.item || "",
      },
      fromCache: true,
    },
  };
}

function isUpstreamError(error) {
  if (error?.code === "ECONNREFUSED" || error?.code === "ENOTFOUND") return true;
  const status = error?.status ?? error?.response?.status;
  return typeof status === "number" && status >= 500;
}

// ─── Story seed banks ──────────────────────────────────────────────────────────

const STORY_ENGINES = [
  "discovery of a hidden place",
  "gentle helper story",
  "small journey through a peaceful world",
  "dream world entrance",
  "quiet mystery",
  "nature guide story",
  "magical object story",
  "secret nighttime task",
  "hidden place exploration",
  "environmental transformation story",
  "giant-scale world story",
  "tiny world story",
  "cloud adventure",
  "underwater adventure",
  "moon adventure",
  "quiet nighttime celebration",
  "calm getting-unlost story",
  "magical school or learning place",
  "memory or old tale shared by a character",
  "dream-making or dream-delivery story",
];

const SETTING_SEEDS = [
  "a lantern path through a sleepy forest",
  "a quiet train station above the clouds",
  "a moon garden with silver leaves",
  "a treehouse village at dusk",
  "a bakery that opens only at night",
  "a bridge between two cloud hills",
  "a field of giant sleepy flowers",
  "a tiny harbor with floating lantern boats",
  "a library inside an old oak tree",
  "a meadow where fireflies gather in circles",
  "a hill with wind chimes and soft grass",
  "a night market run by friendly animals",
  "a warm greenhouse under the stars",
  "a gentle river ferry crossing at dusk",
  "a snow path lit by paper lanterns",
  "a workshop where dreams are packed for bedtime",
];

const OPENING_STYLES = [
  "begin with a striking sensory image",
  "begin with the child noticing something unusual",
  "begin in the middle of a quiet evening walk",
  "begin with a companion arriving gently",
  "begin with a place revealing its secret slowly",
  "begin with a nighttime task already underway",
  "begin with the child hearing or seeing something curious",
  "begin with the child stepping into a new place",
];

const WONDER_SEEDS = [
  "a map that appears only at bedtime",
  "a bell that rings without being touched",
  "a basket that needs delivering before moonrise",
  "a gate that opens after a kind act",
  "a lantern that lights one step at a time",
  "a sleeping bird that needs a safe place to rest",
  "a bridge keeper who needs help finishing a task",
  "a tiny boat waiting for one passenger",
  "a recipe used only at night",
  "a path that changes depending on what is carried",
  "a garden that opens one flower at a time",
  "a pocket-sized key with a moon mark on it",
];

const COMPANION_SEEDS = [
  "Luna the Firefly",
  "Milo the Turtle",
  "Pip the Cloud Fox",
  "Willow the Owl",
  "The Moon Gardener",
  "none",
];

const THEME_LANGUAGE_BANKS = {
  Animals: `
Use concrete animal-world details when helpful:
- nests, paws, feathers, burrows, dens, ponds, reeds, blankets, baskets, little paths

Avoid turning every animal story into "soft glowing forest magic."
`,
  Space: `
Use concrete space details when helpful:
- control panels, stations, orbit paths, satellites, windows, switches, checklists, signals, tools, quiet engines

Avoid vague lines about endless stars unless they serve the story.
`,
  Dinosaurs: `
Use concrete dinosaur-world details when helpful:
- footprints, nests, ferns, wide paths, eggs, cliffs, hills, small roars, muddy ground, leafy plants

Avoid making every dinosaur story scary or chaotic.
`,
  Magic: `
Use concrete magical details when helpful:
- keys, bells, lanterns, small spells, enchanted tools, marked doors, moving maps, moon gardens, tiny workshops, helpful creatures

Avoid relying on generic glowing, whispering, sparkling filler.
`,
  Ocean: `
Use concrete ocean details when helpful:
- docks, harbor lights, ropes, ferry boats, tide lines, shells, nets, wet boards, sea grass, quiet boats

Avoid defaulting to vague deep-water dreaminess.
`,
  Forest: `
Use concrete forest details when helpful:
- branches, bridges, nests, tree roots, paths, logs, lantern posts, leaves, clearings, little houses

Avoid generic "hidden forest secrets" language.
`,
  Vehicles: `
Use concrete vehicle-world details when helpful:
- wheels, carts, trains, stations, bridges, deliveries, tracks, tools, engines, cargo

Avoid making vehicle stories feel like fantasy filler.
`,
  Friendship: `
Use concrete friendship details when helpful:
- shared tasks, notes, deliveries, invitations, gifts, fixing something together, waiting for a friend, helping a friend get ready, making something together

Avoid vague emotional summaries without a real interaction.
`,
  Custom: `
Use concrete details that fit the chosen custom theme.
Avoid generic bedtime fantasy wording.
`,
};

// ─── Prompt builders ───────────────────────────────────────────────────────────

function buildLengthGuidance(length) {
  switch (length) {
    case "Short":  return "Target about 350 to 500 words.";
    case "Medium": return "Target about 600 to 850 words.";
    case "Long":   return "Target about 1000 to 1400 words.";
    default:       return "Target about 600 to 850 words.";
  }
}

function buildLengthRule(length) {
  switch (length) {
    case "Short":
      return `Short:\n- one clear problem or task\n- one meaningful action\n- one satisfying resolution`;
    case "Medium":
      return `Medium:\n- at least two story beats\n- one meaningful interaction\n- one clear change by the end`;
    case "Long":
      return `Long:\n- at least four distinct beats or scenes\n- at least two meaningful interactions or one interaction plus one meaningful solo task\n- a sense of progression or journey\n- one reflective pause near the end\n- must feel like a real short chapter, not a slightly stretched medium story`;
    default:
      return "";
  }
}

function buildCalmGuidance(calmStoryType) {
  switch (calmStoryType) {
    case "Relaxing Story":
      return "Write a deeply calming bedtime story that helps the child feel peaceful and sleepy.";
    case "Brave Story":
      return "Write a gentle bedtime story that helps the child feel safe, brave, and reassured.";
    case "Breathing Story":
      return "Write a soothing bedtime story that encourages slow breathing, calm body cues, and relaxation.";
    default:
      return "Write a gentle bedtime story that highlights warmth, gratitude, and peaceful reflection.";
  }
}

function buildVocabularyGuidance(ageGroup) {
  switch (ageGroup) {
    case "3-5":
      return `
Use very simple, concrete language for a preschool child (ages 3–5).

STRICT RULES:
- Use short sentences
- Use common, everyday words only
- Avoid long or complex words
- Avoid descriptive phrases that are abstract or poetic

DO NOT USE:
- abstract ideas (like "secrets", "mystery", "silence")
- figurative or symbolic language
- objects acting like people ("the cave waited")
- confusing descriptions ("the sky turned deep", "stones hummed")

ALWAYS USE:
- clear, literal descriptions
- simple actions
- things a child can easily picture

BAD: "The stones held secrets."
GOOD: "The stones were smooth and quiet."

Write like a parent speaking simply at bedtime.
`;
    case "6-8":
      return `
Use clear, simple language for early readers (ages 6–8).

RULES:
- Keep sentences easy to understand
- Avoid abstract or confusing phrases
- Prefer clear, literal descriptions

Instead of "the wind whispered secrets"
Write "the wind moved softly through the trees"
`;
    default:
      return `
Use slightly richer vocabulary for confident young readers.

RULES:
- Keep language clear and natural
- Avoid overly poetic or abstract phrasing
- Make sure all descriptions are easy to understand
`;
  }
}

function buildAgeQualityRules(ageGroup) {
  switch (ageGroup) {
    case "3-5":
      return `For ages 3–5:\n- use repetition\n- keep the story comforting and predictable\n- use one simple problem and one warm resolution\n- include one simple emotional connection moment`;
    case "6-8":
      return `For ages 6–8:\n- include one memorable or interesting detail\n- avoid stories that feel babyish\n- include at least one meaningful interaction with another character\n- the story should feel like a gentle adventure with purpose\n- even short stories must not collapse to preschool level`;
    default:
      return `For ages 9–12:\n- include a real choice, responsibility, or thoughtful action\n- include reflection\n- avoid stories that feel like a summary or outline\n- even short stories must still feel complete and satisfying`;
  }
}

function buildSystemPrompt() {
  return `You are an expert children's bedtime story author.

Your stories are warm, immersive, and age-appropriate. They always contain a clear narrative with a real purpose, meaningful interactions, and a gently satisfying ending.

ABSOLUTE RULES (these override everything else):
- Every sentence must make clear, literal sense when read aloud by a parent.
- The child protagonist must DO something meaningful, not just observe.
- Stories must never feel like "the child walked somewhere and looked at things."
- Do NOT write "The End." or a closing bedtime whisper — the server adds these.
- Return ONLY valid JSON matching the required schema. No markdown, no commentary.`;
}

function buildUserPrompt({
  childName,
  ageGroup,
  finalTheme,
  length,
  pronounInstruction,
  calmStoryType,
  calmGuidance,
  characterType,
  characterTrait,
  characterItem,
  continueAdventure,
  recentEpisodeSummaries,
  avoidList,
  themeBank,
  storyEngine,
  settingSeed,
  openingStyle,
  wonderSeed,
  companionSeed,
  lengthGuidance,
  lengthRule,
  vocabularyGuidance,
  ageQualityRules,
}) {
  const continuationSection = continueAdventure
    ? `
CONTINUATION CONTEXT
This is the next episode in an ongoing bedtime story series.

Recent episode summaries:
${recentEpisodeSummaries || "None provided."}

Rules:
- Continue the world, tone, and emotional thread from earlier stories.
- Do NOT restart from scratch or re-explain the entire premise.
- Feel like the next gentle chapter, not a copy of the previous one.
- Introduce something new within that ongoing world.
`
    : `
STANDALONE CONTEXT
This is a standalone bedtime story.
- It must feel complete and satisfying on its own.
- It may hint at a wider world, but must not depend on another story to make sense.
`;

  return `Write an original bedtime story using the inputs below.

─── STORY INPUTS ────────────────────────────────────────────
Child's name:        ${childName}
Age group:           ${ageGroup}
Theme:               ${finalTheme}
Length target:       ${length} (${lengthGuidance})
Pronoun rule:        ${pronounInstruction}
Story feeling:       ${calmStoryType}
Feeling guidance:    ${calmGuidance}
Character role:      ${characterType}
Character trait:     ${characterTrait}
Special item:        ${characterItem || "none"}
Story mode:          ${continueAdventure ? "continuation" : "standalone"}
Story engine:        ${storyEngine}
Setting seed:        ${settingSeed}
Opening style:       ${openingStyle}
Wonder seed:         ${wonderSeed}
Companion seed:      ${companionSeed}
Avoid repeating:     ${avoidList}
─────────────────────────────────────────────────────────────

THEME LANGUAGE BANK
${themeBank}

${continuationSection}

VOCABULARY GUIDANCE
${vocabularyGuidance}

LENGTH RULE
${lengthRule}

AGE QUALITY RULES
${ageQualityRules}

ANTI-REPETITION
Do NOT overuse: glowing, shimmering, whispering, secrets, sparkling, soft breeze, moonlit pools, gentle hum, "if you listen closely."

GUIDED PARTICIPATION
At most once, include one of:
- "Imagine what it would feel like..."
- "You might notice..."

ENDING
The ending should feel earned and calm. The child does NOT have to return to their bedroom.
Stop after the final calm sentence — do NOT write "The End." or a closing whisper.

OUTPUT SCHEMA
Return JSON with exactly this shape:
{
  "title": "string",
  "story": "string",
  "episodeSummary": "string (1–3 sentences summarising key developments for future continuity)"
}`;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

app.post("/generate", generateLimiter, async (req, res) => {
  let resolvedChildName    = "";
  let resolvedTheme        = "";
  let resolvedLength       = "";
  let resolvedAgeGroup     = "";
  let resolvedPronounsMode = "neutral";
  let resolvedReaderVoice  = "shimmer";
  let resolvedCalmStoryType = "Relaxing Story";
  let resolvedCharacter    = { type: "Adventurer", trait: "Curious", item: "" };

  try {
    const {
      childName,
      ageGroup,
      theme,
      length,
      pronounsMode = "neutral",
      customTheme = "",
      character = {},
      readerVoice = "shimmer",
      calmStoryType = "Relaxing Story",
      continueAdventure,
      storySeries = null,
    } = req.body ?? {};

    // ── Input validation ────────────────────────────────────────────────────

    if (!childName || typeof childName !== "string" || !childName.trim()) {
      return res.status(400).json({ error: "Missing or invalid childName." });
    }
    if (childName.trim().length > MAX_CHILD_NAME_LENGTH) {
      return res.status(400).json({
        error: `childName must be ${MAX_CHILD_NAME_LENGTH} characters or fewer.`,
      });
    }
    if (!VALID_AGE_GROUPS.includes(ageGroup)) {
      return res.status(400).json({ error: `Invalid ageGroup. Must be one of: ${VALID_AGE_GROUPS.join(", ")}.` });
    }
    if (!VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: `Invalid theme. Must be one of: ${VALID_THEMES.join(", ")}.` });
    }
    if (!VALID_LENGTHS.includes(length)) {
      return res.status(400).json({ error: `Invalid length. Must be one of: ${VALID_LENGTHS.join(", ")}.` });
    }
    if (!VALID_PRONOUNS.includes(pronounsMode)) {
      return res.status(400).json({ error: `Invalid pronounsMode. Must be one of: ${VALID_PRONOUNS.join(", ")}.` });
    }
    if (!VALID_VOICES.includes(readerVoice)) {
      return res.status(400).json({ error: `Invalid readerVoice. Must be one of: ${VALID_VOICES.join(", ")}.` });
    }
    if (!VALID_CALM_TYPES.includes(calmStoryType)) {
      return res.status(400).json({ error: `Invalid calmStoryType. Must be one of: ${VALID_CALM_TYPES.join(", ")}.` });
    }

    // ── Daily limit ─────────────────────────────────────────────────────────

    checkAndIncrementDailyLimit(req.ip);

    // ── Sanitise prompt inputs ──────────────────────────────────────────────

    const isContinuation = continueAdventure === true;

    const finalTheme =
      theme === "Custom"
        ? safeTruncate(customTheme, MAX_CUSTOM_THEME_LENGTH) || "bedtime adventure"
        : theme;

    const themeBank = THEME_LANGUAGE_BANKS[theme] ?? THEME_LANGUAGE_BANKS.Custom;

    const characterType  = safeTruncate(character?.type  || "Adventurer", MAX_CHARACTER_FIELD_LENGTH) || "Adventurer";
    const characterTrait = safeTruncate(character?.trait || "Curious",    MAX_CHARACTER_FIELD_LENGTH) || "Curious";
    const characterItem  = safeTruncate(character?.item  || "",           MAX_CHARACTER_FIELD_LENGTH);

    // Stash resolved values so the catch block can use them for fallback.
    resolvedChildName     = childName.trim();
    resolvedTheme         = finalTheme;
    resolvedLength        = length;
    resolvedAgeGroup      = ageGroup;
    resolvedPronounsMode  = pronounsMode;
    resolvedReaderVoice   = readerVoice;
    resolvedCalmStoryType = calmStoryType;
    resolvedCharacter     = { type: characterType, trait: characterTrait, item: characterItem };

    // ── Content moderation ──────────────────────────────────────────────────

    await moderateInputs([
      resolvedChildName,
      theme === "Custom" ? customTheme : null,
      character?.type,
      character?.trait,
      character?.item,
    ]);

    // ── Build guidance strings ──────────────────────────────────────────────

    const pronounInstruction = resolvePronounInstruction(pronounsMode);
    const lengthGuidance     = buildLengthGuidance(length);
    const lengthRule         = buildLengthRule(length);
    const calmGuidance       = buildCalmGuidance(calmStoryType);
    const vocabularyGuidance = buildVocabularyGuidance(ageGroup);
    const ageQualityRules    = buildAgeQualityRules(ageGroup);

    // ── Pick seeds ──────────────────────────────────────────────────────────

    const storyEngine   = pickRandom(STORY_ENGINES,   "STORY_ENGINES");
    const settingSeed   = pickRandom(SETTING_SEEDS,   "SETTING_SEEDS");
    const openingStyle  = pickRandom(OPENING_STYLES,  "OPENING_STYLES");
    const wonderSeed    = pickRandom(WONDER_SEEDS,     "WONDER_SEEDS");
    const companionSeed = pickRandom(COMPANION_SEEDS, "COMPANION_SEEDS");

    // ── Build series context ────────────────────────────────────────────────

    const recentEpisodes = Array.isArray(storySeries?.episodes)
      ? storySeries.episodes.slice(-3)
      : [];

    const recentCompanions = recentEpisodes
      .map((ep) => safeTruncate(ep?.companionSeed || "", 80))
      .filter(Boolean);
    const recentEngines = recentEpisodes
      .map((ep) => safeTruncate(ep?.storyEngine || "", 120))
      .filter(Boolean);
    const recentSettings = recentEpisodes
      .map((ep) => safeTruncate(ep?.settingSeed || "", 120))
      .filter(Boolean);

    const recentEpisodeSummaries = recentEpisodes
      .map((ep, index) => {
        const summary =
          typeof ep?.summary === "string" && ep.summary.trim()
            ? safeTruncate(ep.summary, 240)
            : typeof ep?.episodeSummary === "string" && ep.episodeSummary.trim()
              ? safeTruncate(ep.episodeSummary, 240)
              : typeof ep?.story === "string" && ep.story.trim()
                ? safeTruncate(ep.story, 220)
                : "";
        return summary ? `Episode ${index + 1}: ${summary}` : null;
      })
      .filter(Boolean)
      .join("\n");

    const avoidList = [
      recentCompanions.length ? `recent companions: ${recentCompanions.join(", ")}` : null,
      recentEngines.length    ? `recent story engines: ${recentEngines.join(", ")}` : null,
      recentSettings.length   ? `recent settings: ${recentSettings.join(", ")}`    : null,
      "generic bedroom opening",
      "lost item plot",
      "soft blanket opening",
      "warm glow entering a room",
      "sparkles and stars as default imagery",
      "a breeze drifting through the room as a default opening",
      "returning to bed as the only possible ending",
      "empty path-following stories",
      "the child only looking at things without doing something meaningful",
    ].filter(Boolean).join(", ");

    // ── Call OpenAI ─────────────────────────────────────────────────────────

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      childName: resolvedChildName,
      ageGroup,
      finalTheme,
      length,
      pronounInstruction,
      calmStoryType,
      calmGuidance,
      characterType,
      characterTrait,
      characterItem,
      continueAdventure: isContinuation,
      recentEpisodeSummaries,
      avoidList,
      themeBank,
      storyEngine,
      settingSeed,
      openingStyle,
      wonderSeed,
      companionSeed,
      lengthGuidance,
      lengthRule,
      vocabularyGuidance,
      ageQualityRules,
    });

    // Log non-PII fields only — never log childName.
    console.log("Generate request:", { ageGroup, theme, length, calmStoryType });

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bedtime_story",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title:          { type: "string" },
              story:          { type: "string" },
              episodeSummary: { type: "string" },
            },
            required: ["title", "story", "episodeSummary"],
          },
        },
      },
    });

    const raw = response.output_text;

    if (!raw || typeof raw !== "string") {
      throw new Error("Model returned empty output_text.");
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON parse error. Raw output:\n", raw);
      throw parseError;
    }

    const safeTitle = String(parsed.title ?? `A Sleepy Story for ${resolvedChildName}`);
    let safeStory = String(parsed.story ?? "").trim();
    safeStory = ensureEnding(safeStory, resolvedChildName);

    const safeEpisodeSummary =
      typeof parsed.episodeSummary === "string" && parsed.episodeSummary.trim()
        ? parsed.episodeSummary.trim()
        : buildFallbackEpisodeSummary(safeStory, safeTitle);

    return res.json({
      title: safeTitle,
      story: safeStory,
      episodeSummary: safeEpisodeSummary,
      meta: {
        childName: resolvedChildName,
        age: ageGroup,
        theme: finalTheme,
        length,
        pronounsMode,
        readerVoice,
        calmStoryType,
        character: { type: characterType, trait: characterTrait, item: characterItem },
        storyEngine,
        settingSeed,
        openingStyle,
        wonderSeed,
        companionSeed,
      },
    });

  } catch (error) {
    // 400: validation or moderation rejection.
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }

    // 429: daily limit reached.
    if (error.status === 429) {
      return res.status(429).json({ error: error.message });
    }

    // 5xx / network: OpenAI is down — serve a fallback story if possible.
    if (isUpstreamError(error) && resolvedChildName) {
      console.warn("OpenAI unavailable, serving fallback story.", {
        code: error?.code,
        status: error?.status,
      });
      try {
        const fallback = getFallbackStory({
          childName:     resolvedChildName,
          theme:         resolvedTheme,
          length:        resolvedLength,
          ageGroup:      resolvedAgeGroup,
          pronounsMode:  resolvedPronounsMode,
          readerVoice:   resolvedReaderVoice,
          calmStoryType: resolvedCalmStoryType,
          character:     resolvedCharacter,
        });
        return res.json(fallback);
      } catch (fallbackError) {
        console.error("Fallback story also failed:", fallbackError.message);
      }
    }

    // Unexpected error — log fully server-side, return minimal detail to client.
    console.error("GENERATE ERROR:", error);
    return res.status(500).json({
      error: "Story generation failed.",
      ...(isDev && { details: String(error?.message || error) }),
    });
  }
});

app.post("/tts", ttsLimiter, async (req, res) => {
  const started = Date.now();

  try {
    const { text, voice = "shimmer", format = "mp3" } = req.body ?? {};
    console.log("TTS request started. Text length:", text?.length);

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Missing or empty 'text' in request body." });
    }
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      return res.status(400).json({
        error: `Text is too long. Maximum length is ${MAX_TTS_TEXT_LENGTH} characters.`,
      });
    }
    if (!VALID_VOICES.includes(voice)) {
      return res.status(400).json({ error: `Invalid voice. Must be one of: ${VALID_VOICES.join(", ")}.` });
    }
    if (!VALID_TTS_FORMATS.includes(format)) {
      return res.status(400).json({ error: `Invalid format. Must be one of: ${VALID_TTS_FORMATS.join(", ")}.` });
    }

    const audio = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      format,
    });

    console.log("OpenAI TTS completed in", Date.now() - started, "ms");

    const buffer = Buffer.from(await audio.arrayBuffer());

    res.setHeader("Content-Type", getAudioContentType(format));
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);

  } catch (err) {
    console.error("TTS ERROR:", err?.message ?? err);
    return res.status(500).json({
      error: "TTS generation failed.",
      ...(isDev && { details: String(err?.message || err) }),
    });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});