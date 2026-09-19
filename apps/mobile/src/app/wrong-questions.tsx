import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DetailHeader } from "@/components/student/detail-header";
import { PageFade } from "@/components/student/page-fade";
import { studentTheme } from "@/constants/student-theme";
import { useCurrentCourse } from "@/providers/current-course-provider";

const filters = ["全部", "章节", "题型", "待掌握"];

export default function WrongQuestionsScreen() {
  const { selectedCourse } = useCurrentCourse();

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PageFade>
        <DetailHeader
          onBack={() => router.back()}
          subtitle={selectedCourse?.name ?? "当前课程"}
          title="错题整理"
        />
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <SymbolView
                name={{ android: "replay", web: "replay" }}
                size={23}
                tintColor={studentTheme.color.primary}
              />
            </View>
            <Text style={styles.eyebrow}>本周重点复习</Text>
            <Text style={styles.heroTitle}>把错误变成下一次学习行动</Text>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>--</Text>
                <Text style={styles.metricLabel}>待复习</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>--</Text>
                <Text style={styles.metricLabel}>已掌握</Text>
              </View>
            </View>
            <View style={styles.disabledButton}>
              <SymbolView
                name={{ android: "play_arrow", web: "play_arrow" }}
                size={18}
                tintColor={studentTheme.color.textSubtle}
              />
              <Text style={styles.disabledButtonText}>开始复习 · 暂无可复习内容</Text>
            </View>
          </View>

          <View style={styles.filterRow}>
            {filters.map((filter) => (
              <View key={filter} style={styles.filter}>
                <Text style={styles.filterText}>{filter}</Text>
              </View>
            ))}
          </View>

          <View style={styles.unavailableCard}>
            <View style={styles.unavailableIcon}>
              <SymbolView
                name={{ android: "construction", web: "construction" }}
                size={20}
                tintColor={studentTheme.color.warning}
              />
            </View>
            <View style={styles.unavailableCopy}>
              <Text style={styles.unavailableTitle}>错题记录暂不可用</Text>
              <Text style={styles.unavailableText}>
                当前无法读取你的错题记录，请稍后再试。
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>错题卡</Text>
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderTitle}>暂时无法展示错题</Text>
              <Text style={styles.placeholderText}>
                错题记录可用后，这里会显示题目摘要、章节、知识点、错误次数和最近错误时间。
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ECHO 复习建议</Text>
            <View style={styles.suggestionCard}>
              <SymbolView
                name={{ android: "auto_awesome", web: "auto_awesome" }}
                size={18}
                tintColor={studentTheme.color.violet}
              />
              <View style={styles.suggestionCopy}>
                <Text style={styles.suggestionTitle}>暂无足够错题证据</Text>
                <Text style={styles.suggestionText}>
                  有足够错题记录后，这里会优先提示需要再次复习的知识点。
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </PageFade>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  content: {
    gap: 15,
    padding: 16,
    paddingBottom: 36,
  },
  hero: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.hero,
    borderWidth: 1,
    padding: 18,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 13,
  },
  heroTitle: {
    color: studentTheme.color.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 29,
    marginTop: 5,
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  metric: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: studentTheme.radius.card,
    flex: 1,
    padding: 12,
  },
  metricValue: {
    color: studentTheme.color.text,
    fontSize: 21,
    fontWeight: "900",
  },
  metricLabel: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  disabledButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: studentTheme.radius.medium,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: 15,
    minHeight: 44,
    opacity: 0.65,
  },
  disabledButtonText: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filter: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.pill,
    borderWidth: 1,
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
    opacity: 0.58,
  },
  filterText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  unavailableCard: {
    alignItems: "flex-start",
    backgroundColor: studentTheme.color.warningSoft,
    borderColor: studentTheme.color.warningBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 15,
  },
  unavailableIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  unavailableCopy: {
    flex: 1,
  },
  unavailableTitle: {
    color: studentTheme.color.warning,
    fontSize: 14,
    fontWeight: "900",
  },
  unavailableText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  gapCode: {
    color: studentTheme.color.warning,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 9,
  },
  section: {
    gap: 9,
  },
  sectionTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
  },
  placeholderCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  placeholderTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
  },
  placeholderText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  suggestionCard: {
    alignItems: "flex-start",
    backgroundColor: studentTheme.color.hintSoft,
    borderColor: studentTheme.color.hintBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  suggestionCopy: {
    flex: 1,
  },
  suggestionTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
  },
  suggestionText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
  },
});
