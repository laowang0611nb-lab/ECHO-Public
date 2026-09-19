import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

function webStorage(): Storage | null {
  if (typeof globalThis.localStorage === "undefined") {
    return null;
  }
  return globalThis.localStorage;
}

export function studentCourseStorageKey(userId: string): string {
  return `echo.student.current-course.${userId}`;
}

export const studentStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return webStorage()?.getItem(key) ?? null;
    }
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      webStorage()?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      webStorage()?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
