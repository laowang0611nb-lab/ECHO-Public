import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { studentTheme } from "@/constants/student-theme";

export function DetailHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="返回"
        onPress={onBack}
        style={styles.iconButton}
      >
        <SymbolView
          name={{ android: "arrow_back", web: "arrow_back" }}
          size={22}
          tintColor={studentTheme.color.text}
        />
      </Pressable>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderBottomColor: studentTheme.color.divider,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 6,
  },
  iconButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  copy: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  spacer: {
    height: 42,
    width: 42,
  },
});
