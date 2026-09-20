import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, type ReactNode } from "react";

import { studentTheme } from "@/constants/student-theme";

export function AuthScreen({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.screen}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>E</Text>
            </View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandTitle}>ECHO</Text>
              <Text style={styles.brandSubtitle}>让学习更高效</Text>
            </View>
          </View>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>

          <View style={styles.formCard}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function AuthField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#98a3b5"
        {...props}
        style={[styles.input, error && styles.inputError, props.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function PasswordField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.passwordWrap, error && styles.inputError]}>
        <TextInput
          autoCapitalize="none"
          placeholderTextColor="#98a3b5"
          secureTextEntry={!visible}
          {...props}
          style={[styles.passwordInput, props.style]}
        />
        <Pressable
          accessibilityLabel={visible ? "隐藏密码" : "显示密码"}
          onPress={() => setVisible((current) => !current)}
          style={styles.passwordToggle}
        >
          <SymbolView
            name={{
              android: visible ? "visibility_off" : "visibility",
              web: visible ? "visibility_off" : "visibility",
            }}
            size={18}
            tintColor={studentTheme.color.textMuted}
          />
        </Pressable>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function AuthButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const inactive = Boolean(loading || disabled);
  return (
    <Pressable
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        inactive && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AuthLink({
  prompt,
  action,
  onPress,
}: {
  prompt: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.linkRow}>
      <Text style={styles.linkPrompt}>{prompt}</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.linkAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

export function AuthErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <SymbolView
        name={{ android: "error", web: "error" }}
        size={17}
        tintColor={studentTheme.color.danger}
      />
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    alignSelf: "center",
    maxWidth: 520,
    padding: 20,
    paddingBottom: 36,
    width: "100%",
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  logo: {
    alignItems: "center",
    backgroundColor: studentTheme.color.text,
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
  },
  brandCopy: {
    flex: 1,
  },
  brandTitle: {
    color: studentTheme.color.text,
    fontSize: 23,
    fontWeight: "900",
  },
  brandSubtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  heading: {
    marginTop: 34,
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 29,
    fontWeight: "900",
    marginTop: 7,
  },
  description: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  formCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.hero,
    borderWidth: 1,
    marginTop: 24,
    padding: 20,
  },
  field: {
    marginTop: 16,
  },
  label: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
  },
  input: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    color: studentTheme.color.text,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 13,
  },
  inputError: {
    borderColor: studentTheme.color.danger,
  },
  fieldError: {
    color: studentTheme.color.danger,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },
  passwordWrap: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 50,
  },
  passwordInput: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  passwordToggle: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    marginTop: 22,
    minHeight: 50,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  linkRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 18,
  },
  linkPrompt: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
  },
  linkAction: {
    color: studentTheme.color.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  errorBanner: {
    alignItems: "flex-start",
    backgroundColor: "#fff5f4",
    borderColor: "#efb4af",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
    padding: 11,
  },
  errorBannerText: {
    color: studentTheme.color.danger,
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
