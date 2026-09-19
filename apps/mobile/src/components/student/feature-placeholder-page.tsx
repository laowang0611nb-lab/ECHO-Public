import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { studentTheme } from "@/constants/student-theme";

export function FeaturePlaceholderPage({
  title,
  description,
  parameter,
}: {
  title: string;
  description: string;
  parameter?: string;
}) {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/ai")
          }
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.content}>
        <View style={styles.mark}>
          <Text style={styles.markText}>E</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {parameter ? <Text style={styles.parameter}>{parameter}</Text> : null}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>下一阶段实现</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  header: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderBottomColor: studentTheme.color.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: 12,
  },
  backButton: {
    alignItems: "center",
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  backText: {
    color: studentTheme.color.text,
    fontSize: 28,
    lineHeight: 30,
    marginTop: -2,
  },
  headerTitle: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  mark: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  markText: {
    color: studentTheme.color.primary,
    fontSize: 22,
    fontWeight: "900",
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 18,
    textAlign: "center",
  },
  description: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 440,
    textAlign: "center",
  },
  parameter: {
    color: studentTheme.color.primary,
    fontSize: 12,
    marginTop: 12,
  },
  badge: {
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.pill,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "800",
  },
});
