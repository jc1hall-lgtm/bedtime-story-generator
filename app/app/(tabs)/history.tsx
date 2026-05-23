import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFavorites } from "../../lib/favoritesStore";
import { useRecentStories } from "../../lib/recentStoriesStore";
import { useStoryStore } from "../../lib/storyStore";
import { BedtimeTheme } from "../../lib/theme";

const STARS_IMAGE = require("../../assets/images/stars.png");
const MOON_IMAGE = require("../../assets/images/moon.png");

export default function HistoryScreen() {
  const { items: favoriteItems, isReady: favoritesReady } = useFavorites();
  const { items: recentItems, isReady: recentsReady } = useRecentStories();
  const { setStory } = useStoryStore();

  function openStory(item: any) {
    setStory({
      title: item.title,
      story: item.story,
      meta: item.meta ?? {},
    });
    router.push("/story");
  }

  const isReady = favoritesReady && recentsReady;
  const hasFavorites = favoriteItems.length > 0;
  const hasRecents = recentItems.length > 0;
  const isEmpty = !hasFavorites && !hasRecents;

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
            <Text style={styles.title}>Library</Text>
          </View>

          {!isReady ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : isEmpty ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No stories yet</Text>
              <Text style={styles.muted}>
                Generate your first one to see it here.
              </Text>
            </View>
          ) : (
            <>
              {hasFavorites ? (
                <>
                  <Text style={styles.sectionHeader}>Saved ★</Text>
                  {favoriteItems.map((fav) => (
                    <Pressable
                      key={fav.id}
                      onPress={() => openStory(fav)}
                      style={({ pressed }) => [
                        styles.card,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {fav.title}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {[fav.meta?.childName, fav.meta?.theme, fav.meta?.length]
                          .filter(Boolean)
                          .join(" • ")}
                      </Text>
                    </Pressable>
                  ))}
                </>
              ) : null}

              {hasFavorites && hasRecents ? (
                <View style={styles.divider} />
              ) : null}

              {hasRecents ? (
                <>
                  <Text style={styles.sectionHeader}>Recent</Text>
                  {recentItems.map((recent) => (
                    <Pressable
                      key={recent.id}
                      onPress={() => openStory(recent)}
                      style={({ pressed }) => [
                        styles.card,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {recent.title}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {[recent.meta?.childName, recent.meta?.theme, recent.meta?.length]
                          .filter(Boolean)
                          .join(" • ")}
                      </Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </>
          )}
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
  sectionHeader: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginVertical: 16,
  },
  emptyCard: {
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 20,
    ...BedtimeTheme.shadow.card,
  },
  emptyTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 6,
  },
  muted: {
    color: BedtimeTheme.colors.textMuted,
    lineHeight: 20,
  },
  card: {
    backgroundColor: BedtimeTheme.colors.card,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.cardBorder,
    borderRadius: BedtimeTheme.radius.xl,
    padding: 16,
    marginBottom: 12,
    ...BedtimeTheme.shadow.card,
  },
  pressed: { opacity: 0.8 },
  cardTitle: {
    color: BedtimeTheme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  cardMeta: {
    color: BedtimeTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
