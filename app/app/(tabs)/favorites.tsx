import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useFavorites } from "../../lib/favoritesStore";
import { useStoryStore } from "../../lib/storyStore";

export default function FavoritesScreen() {
  const { items, isReady } = useFavorites();
  const { setStory } = useStoryStore();

  function openFavorite(fav: any) {
    setStory({
      title: fav.title,
      story: fav.story,
      meta: fav.meta ?? {},
    });
    router.push("/story");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>⭐ Favorites</Text>

      {!isReady ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>
          No favorites yet. Open a story and tap ⭐ to save it.
        </Text>
      ) : (
        items.map((fav) => (
          <Pressable
            key={fav.id}
            onPress={() => openFavorite(fav)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.cardTitle}>{fav.title}</Text>
            <Text style={styles.cardMeta}>
              {fav.meta?.childName ? `${fav.meta.childName} • ` : ""}
              {fav.meta?.theme ? `${fav.meta.theme} • ` : ""}
              {fav.meta?.length ? `${fav.meta.length}` : ""}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, backgroundColor: "#F5F7FB" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  muted: { opacity: 0.7, lineHeight: 20 },
  card: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E6EF",
  },
  pressed: { opacity: 0.9 },
  cardTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  cardMeta: { fontSize: 12, opacity: 0.7 },
});