import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/hooks/useAuth";
import { useDashboard } from "@/hooks/useDashboard";

export default function MoreScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { state } = useDashboard();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const items: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; sub: string; color: string; route: string }[] = [
    { icon: "dollar-sign", label: "Finance", sub: "Income, expenses & loans", color: "#22c55e", route: "/finance" },
    { icon: "book-open", label: "Library", sub: "Books & reading progress", color: "#3b82f6", route: "/library" },
    { icon: "archive", label: "Archive", sub: "Notes, ideas & wisdom", color: "#f59e0b", route: "/archive" },
  ];

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: 120, paddingHorizontal: 16, gap: 14 }}
    >
      <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 26 }}>More</Text>

      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: c.primary + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="user" size={24} color={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }} numberOfLines={1}>
            {user?.email ?? "Adventurer"}
          </Text>
          <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>
            Level {state.currentLevel} · {state.currentXP} XP
          </Text>
        </View>
      </Card>

      {items.map((it) => (
        <Pressable
          key={it.route}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            router.push(it.route as any);
          }}
        >
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: it.color + "22",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name={it.icon} size={22} color={it.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>{it.label}</Text>
              <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{it.sub}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={c.mutedForeground} />
          </Card>
        </Pressable>
      ))}

      <Pressable onPress={confirmSignOut} style={{ marginTop: 8 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderColor: c.destructive + "55" }}>
          <Feather name="log-out" size={18} color={c.destructive} />
          <Text style={{ color: c.destructive, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Sign Out</Text>
        </Card>
      </Pressable>
    </ScrollView>
  );
}
