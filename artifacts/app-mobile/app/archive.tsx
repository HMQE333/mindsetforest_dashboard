import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, EmptyState, Loader, PrimaryButton } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useArchive } from "@/hooks/useArchive";

export default function ArchiveScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { blocks, loading, addBlock, deleteBlock, togglePin } = useArchive();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  if (loading) return <Loader />;

  const sorted = [...blocks].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned));

  const submit = () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert("Empty note", "Add a title or some content.");
      return;
    }
    addBlock({
      title: title.trim() || "Untitled",
      content: content.trim(),
      pillars: [],
      directions: [],
      tags: [],
      source_url: null,
      is_pinned: false,
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOpen(false);
    setTitle("");
    setContent("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 + insets.bottom, gap: 12 }}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Feather name="archive" size={36} color={c.mutedForeground} />}
            title="Your archive is empty"
            subtitle="Capture notes, ideas, and wisdom you want to keep."
          />
        ) : (
          sorted.map((b) => (
            <Card key={b.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Text style={{ flex: 1, color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>
                  {b.title}
                </Text>
                <Pressable onPress={() => togglePin(b.id, b.is_pinned)} hitSlop={8}>
                  <Feather name={b.is_pinned ? "star" : "star"} size={18} color={b.is_pinned ? "#f59e0b" : c.mutedForeground} />
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert("Delete note?", b.title, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteBlock(b.id) },
                    ])
                  }
                  hitSlop={8}
                >
                  <Feather name="trash-2" size={16} color={c.mutedForeground} />
                </Pressable>
              </View>
              {b.content ? (
                <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 6, lineHeight: 20 }}>
                  {b.content}
                </Text>
              ) : null}
            </Card>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={() => {
          if (Platform.OS !== "web") Haptics.selectionAsync();
          setOpen(true);
        }}
        style={{
          position: "absolute",
          right: 20,
          bottom: 28 + insets.bottom,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.primary,
          alignItems: "center",
          justifyContent: "center",
          elevation: 6,
        }}
      >
        <Feather name="plus" size={26} color="#fff" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 24,
              paddingBottom: 24 + insets.bottom,
              gap: 14,
            }}
          >
            <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 18 }}>New Note</Text>
            <View style={wrap(c)}>
              <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={c.mutedForeground} style={inp(c)} />
            </View>
            <View style={[wrap(c), { paddingVertical: 4 }]}>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="Write something worth keeping…"
                placeholderTextColor={c.mutedForeground}
                multiline
                style={[inp(c), { minHeight: 100, textAlignVertical: "top" }]}
              />
            </View>
            <PrimaryButton label="Save Note" onPress={submit} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const wrap = (c: any) => ({
  backgroundColor: c.background,
  borderRadius: c.radius,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: c.border,
  paddingHorizontal: 16,
});
const inp = (c: any) => ({ color: c.foreground, fontFamily: "Inter_400Regular", fontSize: 16, paddingVertical: 14 });
