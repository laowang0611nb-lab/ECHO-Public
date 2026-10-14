import { Pressable, StyleSheet, Text, View } from "react-native";

import { studentTheme } from "@/constants/student-theme";

export type PrimaryRoute = "ai" | "courses" | "me";

const items: { route: PrimaryRoute; label: string }[] = [
  { route: "ai", label: "AI 助学" },
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
          <View style={styles.logoHighlight} />
          <View style={styles.logoDot} />
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
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.route)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Text
                numberOfLines={1}
                style={[styles.itemText, selected && styles.itemTextSelected]}
              >
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
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 10,
  },
  brand: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 8,
  },
  logo: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: 13,
    height: 34,
    justifyContent: "center",
    shadowColor: studentTheme.color.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 4,
    width: 34,
  },
  logoHighlight: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    height: 13,
    left: 5,
    position: "absolute",
    top: 4,
    transform: [{ rotate: "-28deg" }],
    width: 7,
  },
  logoDot: {
    backgroundColor: "#8ec5ff",
    borderColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 2,
    height: 9,
    position: "absolute",
    right: -2,
    top: -2,
    width: 9,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  brandText: {
    color: studentTheme.color.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0,
  },
  items: {
    alignItems: "stretch",
    flex: 1,
    flexDirection: "row",
    flexShrink: 1,
    justifyContent: "flex-end",
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 7,
  },
  itemText: {
    color: studentTheme.color.inkMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  itemTextSelected: {
    color: studentTheme.color.primary,
    fontWeight: "900",
  },
  indicator: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: 999,
    bottom: 2,
    height: 3,
    position: "absolute",
    width: 30,
  },
  pressed: {
    opacity: 0.7,
  },
});
