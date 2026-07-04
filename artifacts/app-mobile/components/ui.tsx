import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";

export const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
export const WEB_BOTTOM_INSET = Platform.OS === "web" ? 34 : 0;

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ProgressBar({ value, color, track }: { value: number; color: string; track?: string }) {
  const c = useColors();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: track || c.muted, overflow: "hidden" }}>
      <View style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  color,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
  testID?: string;
}) {
  const c = useColors();
  const bg = color || c.primary;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: bg,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        borderRadius: c.radius,
        paddingVertical: 15,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 8 }}>
      {icon}
      <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", maxWidth: 260 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Loader() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
      <ActivityIndicator color={c.primary} size="large" />
    </View>
  );
}

export function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress: () => void;
}) {
  const c = useColors();
  const accent = color || c.primary;
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        onPress();
      }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? accent : c.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? accent : c.border,
      }}
    >
      <Text
        style={{
          color: active ? "#fff" : c.mutedForeground,
          fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
