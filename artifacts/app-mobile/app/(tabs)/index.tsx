import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, ProgressBar } from "@/components/ui";
import { CATEGORIES, type Mission } from "@/lib/data";
import { useColors } from "@/hooks/useColors";
import { useDashboard } from "@/hooks/useDashboard";

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { state, completeMission, uncompleteMission, getMissions, getCompletedCount } = useDashboard();

  const [expanded, setExpanded] = useState<string | null>(null);

  const xpInLevel = state.currentXP % 100;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: 120, paddingHorizontal: 16, gap: 14 }}
    >
      <View style={{ marginBottom: 2 }}>
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Your Life. Your Quest.</Text>
        <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 26 }}>MindsetForest</Text>
      </View>

      {/* XP / Level hero */}
      <LinearGradient
        colors={["#6d3bd4", "#4f46e5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: c.radius, padding: 20 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Inter_500Medium", fontSize: 13 }}>Level</Text>
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 44, lineHeight: 50 }}>{state.currentLevel}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="zap" size={16} color="#fde68a" />
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 }}>{state.currentXP} XP</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="award" size={16} color="#fca5a5" />
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 }}>{state.streakDays} day streak</Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 16 }}>
          <ProgressBar value={xpInLevel} color="#fff" track="rgba(255,255,255,0.2)" />
          <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 6 }}>
            {xpInLevel}/100 XP to level {state.currentLevel + 1}
          </Text>
        </View>
      </LinearGradient>

      <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 17, marginTop: 6 }}>
        Daily Missions
      </Text>

      {CATEGORIES.map((cat) => {
        const missions = getMissions(cat.id) as (Mission & { __originalIndex: number })[];
        const done = getCompletedCount(cat.id);
        const isOpen = expanded === cat.id;
        return (
          <Card key={cat.id} style={{ padding: 0, overflow: "hidden" }}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setExpanded(isOpen ? null : cat.id);
              }}
              style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: cat.color + "22",
                }}
              >
                <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>{cat.name}</Text>
                <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{cat.tagline}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ color: cat.color, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                  {done}/{missions.length}
                </Text>
                <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={c.mutedForeground} />
              </View>
            </Pressable>

            {isOpen ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                {missions.map((m) => {
                  const id = `${cat.id}-${m.__originalIndex}`;
                  const completed = state.completedMissions.has(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => {
                        if (Platform.OS !== "web")
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (completed) uncompleteMission(cat.id, m.__originalIndex, m.xp);
                        else completeMission(cat.id, m.__originalIndex, m.xp);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 12,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: c.border,
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: completed ? cat.color : c.border,
                          backgroundColor: completed ? cat.color : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {completed ? <Feather name="check" size={14} color="#fff" /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: completed ? c.mutedForeground : c.foreground,
                            fontFamily: "Inter_500Medium",
                            fontSize: 14,
                            textDecorationLine: completed ? "line-through" : "none",
                          }}
                        >
                          {m.title}
                        </Text>
                        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 }}>
                          {m.duration}
                        </Text>
                      </View>
                      <Text style={{ color: cat.color, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>+{m.xp}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}
