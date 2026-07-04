import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Loader, PrimaryButton } from "@/components/ui";
import { REWARDS, determineTier, randomMessage, type Reward } from "@/lib/data";
import { useColors } from "@/hooks/useColors";
import { useDashboard } from "@/hooks/useDashboard";
import { useOracle } from "@/hooks/useOracle";

const SACRIFICE_OPTIONS = [10, 25, 50];

export default function OracleScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { state: dash, spendXP } = useDashboard();
  const { state, loading, sacrificeXP, purchaseReward } = useOracle();
  const [sacrificeOpen, setSacrificeOpen] = useState(false);

  const tier = determineTier(state.oracleXP);
  const message = useMemo(() => randomMessage(tier), [tier.id]);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) return <Loader />;

  const doSacrifice = (amount: number) => {
    if (dash.currentXP < amount) {
      Alert.alert("Not enough XP", `You need ${amount} XP to sacrifice.`);
      return;
    }
    spendXP(amount);
    sacrificeXP(amount);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSacrificeOpen(false);
  };

  const buy = (r: Reward) => {
    if (state.oracleXP < r.cost) {
      Alert.alert("Not enough Oracle XP", `${r.name} costs ${r.cost} Oracle XP.`);
      return;
    }
    Alert.alert("Redeem reward?", `Spend ${r.cost} Oracle XP on ${r.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Redeem",
        onPress: () => {
          if (purchaseReward(r.id, r.name, r.cost) && Platform.OS !== "web")
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const grouped: { key: Reward["category"]; label: string }[] = [
    { key: "instant", label: "Instant" },
    { key: "medium", label: "Medium" },
    { key: "growth", label: "Growth" },
    { key: "big", label: "Big" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: 120, paddingHorizontal: 16, gap: 16 }}>
        <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 26 }}>Oracle</Text>

        {/* Oracle orb */}
        <Card style={{ alignItems: "center", paddingVertical: 28 }}>
          <View style={{ alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <View
              style={{
                position: "absolute",
                width: 150,
                height: 150,
                borderRadius: 75,
                backgroundColor: tier.glow,
                opacity: 0.25,
              }}
            />
            <LinearGradient
              colors={[tier.glow, "#0b0d12"]}
              style={{
                width: 110,
                height: 110,
                borderRadius: 55,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: tier.glow,
              }}
            >
              <Feather name="eye" size={44} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 20 }}>{tier.label}</Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              fontStyle: "italic",
              marginTop: 6,
              textAlign: "center",
            }}
          >
            “{message}”
          </Text>
        </Card>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Card style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: c.primary, fontFamily: "Inter_700Bold", fontSize: 24 }}>{state.oracleXP}</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>Oracle XP</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 24 }}>{state.totalXPSacrificed}</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>Sacrificed</Text>
          </Card>
        </View>

        <PrimaryButton
          label={`Sacrifice XP  ·  ${dash.currentXP} available`}
          onPress={() => setSacrificeOpen(true)}
        />

        <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 17, marginTop: 4 }}>Rewards</Text>

        {grouped.map((g) => (
          <View key={g.key} style={{ gap: 10 }}>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{g.label}</Text>
            {REWARDS.filter((r) => r.category === g.key).map((r) => {
              const afford = state.oracleXP >= r.cost;
              return (
                <Pressable key={r.id} onPress={() => buy(r)}>
                  <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: afford ? 1 : 0.55 }}>
                    <Text style={{ fontSize: 24 }}>{r.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{r.name}</Text>
                      <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>
                        {r.description}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: afford ? c.primary : c.muted,
                      }}
                    >
                      <Text style={{ color: afford ? "#fff" : c.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                        {r.cost}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Modal visible={sacrificeOpen} transparent animationType="fade" onRequestClose={() => setSacrificeOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => setSacrificeOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 24,
              paddingBottom: 24 + (Platform.OS === "web" ? 34 : insets.bottom),
              gap: 12,
            }}
          >
            <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 18 }}>Sacrifice XP</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>
              Convert your XP into Oracle XP to unlock rewards.
            </Text>
            {SACRIFICE_OPTIONS.map((amt) => (
              <Pressable
                key={amt}
                onPress={() => doSacrifice(amt)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  backgroundColor: c.background,
                  borderRadius: c.radius,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: c.border,
                  padding: 16,
                }}
              >
                <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>{amt} XP</Text>
                <Feather name="chevron-right" size={18} color={c.mutedForeground} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
