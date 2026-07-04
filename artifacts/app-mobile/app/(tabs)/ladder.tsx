import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Chip, Loader, PrimaryButton, ProgressBar } from "@/components/ui";
import { CATEGORIES, LADDER_LEVELS, categoryColor, type LadderTask } from "@/lib/data";
import { useColors } from "@/hooks/useColors";
import { useLadder } from "@/hooks/useLadder";

export default function LadderScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { ladders, activeCategory, loading, changeCategory, addTask, toggleTask, deleteTask, getProgress } = useLadder();
  const [addLevel, setAddLevel] = useState<number | null>(null);
  const [text, setText] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const color = categoryColor(activeCategory);
  const progress = getProgress();

  if (loading) return <Loader />;

  const submit = () => {
    if (addLevel === null || !text.trim()) return;
    addTask(addLevel, text.trim());
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddLevel(null);
    setText("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: 120, gap: 14 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 26 }}>Ladder</Text>
          <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>
            Climb from Foundation to Mastery.
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat.id}
              label={`${cat.icon} ${cat.name}`}
              active={activeCategory === cat.id}
              color={cat.color}
              onPress={() => changeCategory(cat.id)}
            />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Progress</Text>
              <Text style={{ color, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{progress.percentage}%</Text>
            </View>
            <ProgressBar value={progress.percentage} color={color} />
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 8 }}>
              {progress.completed} of {progress.total} tasks complete
            </Text>
          </Card>
        </View>

        {LADDER_LEVELS.map((lvl) => {
          const tasks = ladders[activeCategory]?.levels[lvl.level] || [];
          return (
            <View key={lvl.level} style={{ paddingHorizontal: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    backgroundColor: lvl.color + "33",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: lvl.color, fontFamily: "Inter_700Bold", fontSize: 13 }}>{lvl.level}</Text>
                </View>
                <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15, flex: 1 }}>
                  {lvl.title}
                </Text>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setAddLevel(lvl.level);
                    setText("");
                  }}
                  hitSlop={8}
                >
                  <Feather name="plus-circle" size={22} color={lvl.color} />
                </Pressable>
              </View>
              <Card style={{ padding: tasks.length ? 4 : 16 }}>
                {tasks.length === 0 ? (
                  <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" }}>
                    No tasks yet
                  </Text>
                ) : (
                  tasks.map((t: LadderTask, i) => (
                    <View
                      key={t.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: c.border,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          toggleTask(lvl.level, t.id);
                        }}
                        hitSlop={8}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: t.completed ? lvl.color : c.border,
                            backgroundColor: t.completed ? lvl.color : "transparent",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {t.completed ? <Feather name="check" size={13} color="#fff" /> : null}
                        </View>
                      </Pressable>
                      <Text
                        style={{
                          flex: 1,
                          color: t.completed ? c.mutedForeground : c.foreground,
                          fontFamily: "Inter_400Regular",
                          fontSize: 14,
                          textDecorationLine: t.completed ? "line-through" : "none",
                        }}
                      >
                        {t.text}
                      </Text>
                      <Pressable onPress={() => deleteTask(lvl.level, t.id)} hitSlop={8}>
                        <Feather name="trash-2" size={16} color={c.mutedForeground} />
                      </Pressable>
                    </View>
                  ))
                )}
              </Card>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={addLevel !== null} transparent animationType="fade" onRequestClose={() => setAddLevel(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => setAddLevel(null)}
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
              New Task{addLevel !== null ? ` · ${LADDER_LEVELS[addLevel].title}` : ""}
            </Text>
            <View
              style={{
                backgroundColor: c.background,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="What needs to happen?"
                placeholderTextColor={c.mutedForeground}
                autoFocus
                style={{ color: c.foreground, fontFamily: "Inter_400Regular", fontSize: 16, paddingVertical: 16 }}
              />
            </View>
            <PrimaryButton label="Add Task" onPress={submit} color={color} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
