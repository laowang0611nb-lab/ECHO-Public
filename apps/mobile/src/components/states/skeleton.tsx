import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import { studentTheme } from "@/constants/student-theme";

export function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.block, style]} />;
}

export function SkeletonLine({
  width = "100%",
  height = 12,
  style,
}: {
  width?: ViewStyle["width"];
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.line, { height, width }, style]} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.medium,
  },
  line: {
    backgroundColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.pill,
  },
});
