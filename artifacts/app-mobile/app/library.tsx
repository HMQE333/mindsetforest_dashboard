import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Chip, EmptyState, Loader, PrimaryButton, ProgressBar } from "@/components/ui";
import { COVER_COLORS, STATUS_LABELS, type BookStatus } from "@/lib/data";
import { useColors } from "@/hooks/useColors";
import { useLibrary } from "@/hooks/useLibrary";

const STATUSES: BookStatus[] = ["to-read", "reading", "finished"];

export default function LibraryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { books, loading, addBook, updateBook, deleteBook } = useLibrary();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<BookStatus | "all">("all");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");

  if (loading) return <Loader />;

  const filtered = filter === "all" ? books : books.filter((b) => b.status === filter);

  const submit = () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Give the book a title.");
      return;
    }
    addBook({
      title: title.trim(),
      author: author.trim(),
      total_pages: parseInt(pages, 10) || 0,
      pages_read: 0,
      rating: null,
      status: "to-read",
      notes: "",
      cover_color: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
      tags: [],
      pillars: [],
      directions: [],
      format: "owned",
      url: "",
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOpen(false);
    setTitle("");
    setAuthor("");
    setPages("");
  };

  const cycleStatus = (id: string, current: BookStatus) => {
    const next = STATUSES[(STATUSES.indexOf(current) + 1) % STATUSES.length];
    updateBook(id, { status: next });
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 + insets.bottom, gap: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
          {STATUSES.map((s) => (
            <Chip key={s} label={STATUS_LABELS[s]} active={filter === s} onPress={() => setFilter(s)} />
          ))}
        </ScrollView>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Feather name="book-open" size={36} color={c.mutedForeground} />}
            title="No books yet"
            subtitle="Add books to track your reading progress."
          />
        ) : (
          filtered.map((b) => {
            const pct = b.total_pages > 0 ? Math.round((b.pages_read / b.total_pages) * 100) : 0;
            return (
              <Card key={b.id} style={{ flexDirection: "row", gap: 14 }}>
                <View style={{ width: 44, height: 62, borderRadius: 6, backgroundColor: b.cover_color || c.primary }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <Text style={{ flex: 1, color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }} numberOfLines={2}>
                      {b.title}
                    </Text>
                    <Pressable
                      onPress={() =>
                        Alert.alert("Remove book?", b.title, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: () => deleteBook(b.id) },
                        ])
                      }
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={16} color={c.mutedForeground} />
                    </Pressable>
                  </View>
                  {b.author ? (
                    <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{b.author}</Text>
                  ) : null}
                  {b.total_pages > 0 ? (
                    <View style={{ marginTop: 8 }}>
                      <ProgressBar value={pct} color={b.cover_color || c.primary} />
                      <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4 }}>
                        {b.pages_read}/{b.total_pages} pages · {pct}%
                      </Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => cycleStatus(b.id, b.status)} style={{ alignSelf: "flex-start", marginTop: 8 }}>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: c.muted,
                      }}
                    >
                      <Text style={{ color: c.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                        {STATUS_LABELS[b.status]}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </Card>
            );
          })
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
            <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 18 }}>Add Book</Text>
            <View style={wrap(c)}>
              <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={c.mutedForeground} style={inp(c)} />
            </View>
            <View style={wrap(c)}>
              <TextInput value={author} onChangeText={setAuthor} placeholder="Author" placeholderTextColor={c.mutedForeground} style={inp(c)} />
            </View>
            <View style={wrap(c)}>
              <TextInput
                value={pages}
                onChangeText={setPages}
                placeholder="Total pages"
                placeholderTextColor={c.mutedForeground}
                keyboardType="numeric"
                style={inp(c)}
              />
            </View>
            <PrimaryButton label="Add Book" onPress={submit} />
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
