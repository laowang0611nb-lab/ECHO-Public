import { useColorScheme as useRNColorScheme } from "react-native";

export function useColorScheme() {
  const colorScheme = useRNColorScheme();

  if (typeof window === "undefined") {
    return "light";
  }

  return colorScheme;
}
