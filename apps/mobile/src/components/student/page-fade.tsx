import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

export function PageFade({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.container}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
