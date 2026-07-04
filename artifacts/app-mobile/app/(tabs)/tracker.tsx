import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, EmptyState, Loader, PrimaryButton } from "@/components/ui";
import { TRACKER_METRICS, categoryColor, type TrackerMetric } from "@/lib/data";
import { useColors } from "@/hooks/useColors";
import { getAllTimeTotal, getLast7DaysTotal, getTodayTotal, useTracker } from "@/hooks/useTracker";

export default function TrackerScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { entries, loading, addEntry } = useTracker();
  const [active, setActive] = useState<TrackerMetric | null>(null);
  const [value, setValue] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const totalToday = useMemo(
    () => TRACKER_METRICS.reduce((s, m) => s + getTodayTotal(entries, m.id), 0),
    [entries],
  );

  if (loading) return <Loader />;

  const submit = () => {
    const n = parseFloat(value);
    if (!active || isNaN(n) || n <= 0) return;
    addEntry(active.id, n);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActive(null);
    setValue("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: 120, paddingHorizontal: 16, gap: 12 }}
      >
        <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 26 }}>Tracker</Text>
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 4 }}>
          Log your metrics. {totalToday > 0 ? `${totalToday} logged today.` : "Nothing logged today yet."}
        </Text>

        {TRACKER_METRICS.map((m) => {
          const color = categoryColor(m.categoryId);
          const today = getTodayTotal(entries, m.id);
          const week = getLast7DaysTotal(entries, m.id);
          const all = getAllTimeTotal(entries, m.id);
          return (
            <Card key={m.id} style={{ padding: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: color + "22",
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{m.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{m.label}</Text>
                  <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>
                    {m.categoryName}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setActive(m);
                    setValue("");
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: color,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="plus" size={20} color="#fff" />
                </Pressable>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.border,
                }}
              >
                {[
                  { label: "Today", v: today },
                  { label: "7 Days", v: week },
                  { label: "All Time", v: all },
                ].map((stat, i) => (
                  <View
                    key={stat.label}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 12,
                      borderLeftWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderLeftColor: c.border,
                    }}
                  >
                    <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 16 }}>{stat.v}</Text>
                    <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11 }}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => setActive(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 24,
              paddingBottom: 24 + (Platform.OS === "web" ? 34 : insets.bottom),
              gap: 16,
            }}
          >
            <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 18 }}>
              Log {active?.label}
            </Text>
            <View
              style={{
                backgroundColor: c.background,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <TextInput
                testID="tracker-value"
                value={value}
                onChangeText={setValue}
                placeholder="0"
                placeholderTextColor={c.mutedForeground}
                keyboardType="numeric"
                autoFocus
                style={{ flex: 1, color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 20, paddingVertical: 16 }}
              />
              <Text style={{ color: c.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15 }}>{active?.unit}</Text>
            </View>
            <PrimaryButton
              label="Add Entry"
              onPress={submit}
              color={active ? categoryColor(active.categoryId) : undefined}
              testID="tracker-submit"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
