import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { useRecentStories } from "../../lib/recentStoriesStore";
import { SAMPLE_STORY } from "../../lib/sampleStory";
import { useStoryStore } from "../../lib/storyStore";
import { BedtimeTheme } from "../../lib/theme";

type Theme =
  | "Animals"
  | "Space"
  | "Dinosaurs"
  | "Magic"
  | "Ocean"
  | "Forest"
  | "Vehicles"
  | "Friendship"
  | "Custom";

type CalmStoryType =
  | "Relaxing Story"
  | "Brave Story"
  | "Breathing Story"
  | "Gratitude Story";

type ThemeOption = {
  id: Theme;
  emoji: string;
  label: string;
};

const CALM_STORY_TYPES: CalmStoryType[] = [
  "Relaxing Story",
  "Brave Story",
  "Breathing Story",
  "Gratitude Story",
];

const STORY_THEMES: ThemeOption[] = [
  { id: "Animals", emoji: "🦊", label: "Animals" },
  { id: "Space", emoji: "🚀", label: "Space" },
  { id: "Dinosaurs", emoji: "🦖", label: "Dinosaurs" },
  { id: "Magic", emoji: "✨", label: "Magic" },
  { id: "Ocean", emoji: "🌊", label: "Ocean" },
  { id: "Forest", emoji: "🌲", label: "Forest" },
  { id: "Vehicles", emoji: "🚗", label: "Vehicles" },
  { id: "Friendship", emoji: "🤝", label: "Friends" },
  { id: "Custom", emoji: "⭐", label: "Custom" },
];

function ThemeGrid({
  selected,
  onSelect,
}: {
  selected: Theme;
  onSelect: (theme: Theme) => void;
}) {
  return (
    <View style={styles.themeGrid}>
      {STORY_THEMES.map((t) => {
        const isSelected = selected === t.id;

        return (
          <Pressable
            key={t.id}
            onPress={() => onSelect(t.id)}
            style={({ pressed }) => [
              styles.themeCard,
              isSelected && styles.themeCardSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.themeEmoji}>{t.emoji}</Text>
            <Text
              style={[
                styles.themeLabel,
                isSelected && styles.themeLabelSelected,
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function HomeScreen() {
  const { setDraft, setStory } = useStoryStore();
  const { items: recentItems, isReady: recentsReady } = useRecentStories();

  const [name, setName] = useState("");
  const [theme, setTheme] = useState<Theme>("Animals");
  const [customTheme, setCustomTheme] = useState("");
  const [calmStoryType, setCalmStoryType] =
    useState<CalmStoryType>("Relaxing Story");

  const canContinue = useMemo(() => {
    if (!name.trim()) return false;
    if (theme === "Custom" && !customTheme.trim()) return false;
    return true;
  }, [name, theme, customTheme]);

  function handleNext() {
    const childName = name.trim();

    if (!childName) {
      Alert.alert(
        "Missing name",
        "Please enter a child's name to personalize the story."
      );
      return;
    }

    if (theme === "Custom" && !customTheme.trim()) {
      Alert.alert(
        "Missing custom theme",
        "Please enter a custom theme before continuing."
      );
      return;
    }

    setDraft({
      childName,
      theme,
      customTheme: customTheme.trim(),
      calmStoryType,
    });

    router.push("/story-details");
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <LinearGradient
        colors={[
          BedtimeTheme.colors.bgTop,
          BedtimeTheme.colors.bgMid,
          BedtimeTheme.colors.bgBottom,
        ]}
        style={styles.bg}
      >
        <Image
          source={require("../../assets/images/stars.png")}
          style={styles.stars}
          resizeMode="cover"
          pointerEvents="none"
        />

        <Image
          source={require("../../assets/images/moon.png")}
          style={styles.moon}
          resizeMode="contain"
          pointerEvents="none"
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.kicker}>Good night, little dreamer</Text>
              <Text style={styles.title}>Bedtime Stories</Text>
              <Text style={styles.subtitle}>
                Start with the basics. You’ll personalize the story on the next
                screen.
              </Text>
            </View>

            {recentsReady && recentItems.length === 0 ? (
              <View style={styles.sampleCard}>
                <Text style={styles.sampleTitle}>Try a sample story</Text>
                <Text style={styles.sampleSubtitle}>
                  Hear a pre-written bedtime story — no setup needed.
                </Text>
                <Pressable
                  onPress={() => {
                    setStory(SAMPLE_STORY);
                    router.push("/story");
                  }}
                  style={({ pressed }) => [
                    styles.sampleBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.sampleBtnText}>▶ Hear a sample story</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Step 1 of 2</Text>

              <Text style={styles.label}>Child’s name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Caleb"
                placeholderTextColor="rgba(242,245,255,0.45)"
                value={name}
                onChangeText={setName}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="done"
              />

              <Text style={[styles.label, { marginTop: 16 }]}>
                Choose tonight’s world
              </Text>
              <ThemeGrid selected={theme} onSelect={setTheme} />

              {theme === "Custom" ? (
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="e.g., cozy cabin, rain, trains…"
                  placeholderTextColor="rgba(242,245,255,0.45)"
                  value={customTheme}
                  onChangeText={setCustomTheme}
                  autoCorrect={false}
                  autoCapitalize="sentences"
                  maxLength={40}
                />
              ) : null}

              <Text style={[styles.label, { marginTop: 16 }]}>
                What kind of bedtime do you need?
              </Text>
              <Text style={styles.sectionHelp}>
                Pick the feeling you want the story to support tonight.
              </Text>

              <View style={styles.row}>
                {CALM_STORY_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={type}
                    selected={calmStoryType === type}
                    onPress={() => setCalmStoryType(type)}
                  />
                ))}
              </View>

              <Pressable
                onPress={handleNext}
                disabled={!canContinue}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  !canContinue && styles.disabledBtn,
                  pressed && canContinue && styles.pressed,
                ]}
              >
                <Text style={styles.primaryText}>Next</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BedtimeTheme.colors.bgTop,
  },
  bg: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 40,
  },
  stars: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.16,
  },
  moon: {
    position: "absolute",
    top: -14,
    right: -10,
    width: 210,
    height: 210,
    opacity: 0.55,
    transform: [{ rotate: "-6deg" }],
  },
  header: {
    paddingTop: 6,
    paddingBottom: 14,
  },
  kicker: {
    color: BedtimeTheme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  title: {
    color: BedtimeTheme.colors.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 6,
  },
  subtitle: {
    color: BedtimeTheme.colors.textMuted,
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    marginTop: 6,
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 16,
    ...BedtimeTheme.shadow.card,
  },
  sectionTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  sectionHelp: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  label: {
    color: BedtimeTheme.colors.textMuted,
    fontWeight: "800",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: BedtimeTheme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: BedtimeTheme.colors.text,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  themeCard: {
    width: "30.5%",
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  themeCardSelected: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "#B7A6FF",
    shadowColor: "#B7A6FF",
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  themeEmoji: {
    fontSize: 34,
    marginBottom: 6,
  },
  themeLabel: {
    color: BedtimeTheme.colors.textMuted,
    fontWeight: "700",
    fontSize: 12,
  },
  themeLabelSelected: {
    color: BedtimeTheme.colors.text,
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: BedtimeTheme.colors.button,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  primaryText: {
    color: BedtimeTheme.colors.buttonText,
    fontWeight: "900",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
  sampleCard: {
    marginTop: 6,
    marginBottom: 12,
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 16,
    ...BedtimeTheme.shadow.card,
  },
  sampleTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  sampleSubtitle: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  sampleBtn: {
    backgroundColor: BedtimeTheme.colors.button,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  sampleBtnText: {
    color: BedtimeTheme.colors.buttonText,
    fontWeight: "900",
    fontSize: 14,
  },
});