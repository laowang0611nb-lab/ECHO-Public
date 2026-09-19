import { Pressable, StyleSheet, Text, View } from "react-native";

import { studentTheme } from "@/constants/student-theme";

export type PrimaryRoute = "ai" | "courses" | "me";

const items: { route: PrimaryRoute; label: string }[] = [
  { route: "ai", label: "AI助学" },
  { route: "courses", label: "课程" },
  { route: "me", label: "我的" },
];

export function PrimaryNavigation({
  active,
  onSelect,
}: {
  active: PrimaryRoute;
  onSelect: (route: PrimaryRoute) => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>E</Text>
        </View>
        <Text style={styles.brandText}>ECHO</Text>
      </View>
      <View style={styles.items}>
        {items.map((item) => {
          const selected = item.route === active;
          return (
            <Pressable
              key={item.route}
              onPress={() => onSelect(item.route)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
                {item.label}
              </Text>
              {selected ? <View style={styles.indicator} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderBottomColor: studentTheme.color.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  brand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  logo: {
    alignItems: "center",
    backgroundColor: studentTheme.color.text,
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  brandText: {
    color: studentTheme.color.text,
    fontSize: 15,
    fontWeight: "900",
  },
  items: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 12,
  },
  itemText: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  itemTextSelected: {
    color: studentTheme.color.primary,
    fontWeight: "900",
  },
  indicator: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: 999,
    bottom: 3,
    height: 3,
    position: "absolute",
    width: 24,
  },
  pressed: {
    opacity: 0.7,
  },
});
