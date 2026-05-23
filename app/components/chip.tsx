import { Pressable, StyleSheet, Text } from "react-native";
import { BedtimeTheme } from "../lib/theme";

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: BedtimeTheme.colors.chip,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BedtimeTheme.colors.chipBorder,
  },
  chipSelected: {
    backgroundColor: BedtimeTheme.colors.chipSelected,
    borderColor: BedtimeTheme.colors.chipBorderSelected,
  },
  chipText: {
    color: BedtimeTheme.colors.text,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: BedtimeTheme.colors.text,
  },
  pressed: {
    opacity: 0.9,
  },
});
