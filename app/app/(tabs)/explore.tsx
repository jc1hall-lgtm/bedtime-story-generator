import { LinearGradient } from "expo-linear-gradient";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BedtimeTheme } from "../../lib/theme";

const STARS_IMAGE = require("../../assets/images/stars.png");
const MOON_IMAGE = require("../../assets/images/moon.png");

type TipCardProps = {
  emoji: string;
  heading: string;
  body: string;
};

function TipCard({ emoji, heading, body }: TipCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <View style={styles.cardText}>
        <Text style={styles.cardHeading}>{heading}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
    </View>
  );
}

export default function ExploreScreen() {
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
          source={STARS_IMAGE}
          style={styles.stars}
          resizeMode="cover"
          pointerEvents="none"
        />
        <Image
          source={MOON_IMAGE}
          style={styles.moon}
          resizeMode="contain"
          pointerEvents="none"
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>How it works</Text>
            <Text style={styles.subtitle}>
              Tips for getting the most out of bedtime stories.
            </Text>
          </View>

          <TipCard
            emoji="✏️"
            heading="Personalize the story"
            body="Enter your child's name and it appears throughout the story. Pick a theme, age group, and character role to shape the adventure."
          />

          <TipCard
            emoji="🌙"
            heading="Choose the right feeling"
            body="Relaxing Story helps wind down. Brave Story is for nights when your child needs a little courage. Breathing Story weaves in calm, slow breathing cues. Gratitude Story ends on warmth and thankfulness."
          />

          <TipCard
            emoji="🎙️"
            heading="Narration and background music"
            body="Tap Play narration and the app reads the story aloud in a soft voice while quiet bedtime music plays underneath. Tap Stop audio at any time."
          />

          <TipCard
            emoji="📖"
            heading="Story length"
            body="Short is about 3 minutes. Medium is about 5 minutes. Long is about 8 minutes. Short works well for younger children or when bedtime is already late."
          />

          <TipCard
            emoji="✨"
            heading="Continue the adventure"
            body="After a story finishes, tap Continue Adventure to generate the next episode in the same world with the same character. The app remembers recent episodes to keep the story fresh."
          />

          <TipCard
            emoji="⭐"
            heading="Saving favorites"
            body="Tap Save story on the story screen to keep it in your Favorites tab. You can re-read or re-narrate any saved story whenever you like."
          />

          <TipCard
            emoji="🔒"
            heading="Privacy"
            body="Your child's name and story choices are sent to our server only to generate the story. They are not stored on our servers after the story is returned."
          />
        </ScrollView>
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
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 6,
    paddingBottom: 14,
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
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    ...BedtimeTheme.shadow.card,
  },
  cardEmoji: {
    fontSize: 26,
    lineHeight: 32,
    marginTop: 1,
  },
  cardText: {
    flex: 1,
  },
  cardHeading: {
    color: BedtimeTheme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardBody: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
