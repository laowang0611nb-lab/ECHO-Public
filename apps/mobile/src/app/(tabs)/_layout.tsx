import { Stack, router, usePathname } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PrimaryNavigation,
  type PrimaryRoute,
} from "@/components/student/primary-navigation";
import { studentTheme } from "@/constants/student-theme";

export default function StudentTabsLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const active: PrimaryRoute = pathname.endsWith("/courses")
    ? "courses"
    : pathname.endsWith("/me")
      ? "me"
      : "ai";

  function navigate(route: PrimaryRoute) {
    router.replace(`/(tabs)/${route}`);
  }

  return (
    <View style={styles.screen}>
      <View style={{ paddingTop: insets.top }}>
        <PrimaryNavigation active={active} onSelect={navigate} />
      </View>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ai" />
        <Stack.Screen name="courses" />
        <Stack.Screen name="me" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
});
