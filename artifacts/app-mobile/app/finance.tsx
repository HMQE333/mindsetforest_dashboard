import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Chip, EmptyState, Loader, PrimaryButton } from "@/components/ui";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TransactionType } from "@/lib/data";
import { useColors } from "@/hooks/useColors";
import { useFinance } from "@/hooks/useFinance";

const TYPES: { key: TransactionType; label: string; color: string }[] = [
  { key: "income", label: "Income", color: "#22c55e" },
  { key: "expense", label: "Expense", color: "#ef4444" },
  { key: "subscription", label: "Subscription", color: "#f59e0b" },
  { key: "loan_out", label: "Loan Out", color: "#3b82f6" },
  { key: "loan_in", label: "Loan In", color: "#8b5cf6" },
];

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function FinanceScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { transactions, loading, addTransaction, deleteTransaction, currentMonthTotals, subscriptionTotal } = useFinance();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");

  if (loading) return <Loader />;

  const catOptions = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const submit = () => {
    const n = parseFloat(amount);
    if (!title.trim() || isNaN(n) || n <= 0) {
      Alert.alert("Missing info", "Add a title and a valid amount.");
      return;
    }
    addTransaction({
      type,
      title: title.trim(),
      amount: n,
      category: type === "income" || type === "expense" ? category : "other",
      date: new Date().toISOString().split("T")[0],
      is_recurring: type === "subscription",
      recurring_day: null,
      person_name: "",
      is_settled: false,
      notes: "",
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOpen(false);
    setTitle("");
    setAmount("");
    setCategory("other");
  };

  const typeColor = (t: TransactionType) => TYPES.find((x) => x.key === t)?.color || c.primary;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 + insets.bottom, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: "#22c55e", fontFamily: "Inter_700Bold", fontSize: 20 }}>{fmt(currentMonthTotals.income)}</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>Income (mo)</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: "#ef4444", fontFamily: "Inter_700Bold", fontSize: 20 }}>{fmt(currentMonthTotals.expenses)}</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>Expenses (mo)</Text>
          </Card>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <Text
              style={{
                color: currentMonthTotals.savings >= 0 ? "#22c55e" : "#ef4444",
                fontFamily: "Inter_700Bold",
                fontSize: 20,
              }}
            >
              {fmt(currentMonthTotals.savings)}
            </Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>Net savings</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: "#f59e0b", fontFamily: "Inter_700Bold", fontSize: 20 }}>{fmt(subscriptionTotal)}</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>Subscriptions</Text>
          </Card>
        </View>

        <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 17, marginTop: 6 }}>
          Transactions
        </Text>

        {transactions.length === 0 ? (
          <EmptyState
            icon={<Feather name="dollar-sign" size={36} color={c.mutedForeground} />}
            title="No transactions yet"
            subtitle="Tap the + button to log your first income or expense."
          />
        ) : (
          transactions.map((t) => (
            <Card key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: typeColor(t.type) + "22",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather
                  name={t.type === "income" || t.type === "loan_in" ? "arrow-down-left" : "arrow-up-right"}
                  size={18}
                  color={typeColor(t.type)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{t.title}</Text>
                <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>
                  {t.category} · {t.date}
                </Text>
              </View>
              <Text style={{ color: typeColor(t.type), fontFamily: "Inter_700Bold", fontSize: 15 }}>{fmt(t.amount)}</Text>
              <Pressable
                onPress={() =>
                  Alert.alert("Delete transaction?", t.title, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteTransaction(t.id) },
                  ])
                }
                hitSlop={8}
              >
                <Feather name="trash-2" size={16} color={c.mutedForeground} />
              </Pressable>
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
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
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
            <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 18 }}>New Transaction</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TYPES.map((t) => (
                <Chip key={t.key} label={t.label} active={type === t.key} color={t.color} onPress={() => setType(t.key)} />
              ))}
            </ScrollView>

            <View style={inputWrap(c)}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={c.mutedForeground}
                style={inputStyle(c)}
              />
            </View>
            <View style={inputWrap(c)}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="Amount"
                placeholderTextColor={c.mutedForeground}
                keyboardType="numeric"
                style={inputStyle(c)}
              />
            </View>

            {(type === "income" || type === "expense") && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {catOptions.map((cat) => (
                  <Chip key={cat} label={cat} active={category === cat} onPress={() => setCategory(cat)} />
                ))}
              </ScrollView>
            )}

            <PrimaryButton label="Add Transaction" onPress={submit} color={typeColor(type)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const inputWrap = (c: any) => ({
  backgroundColor: c.background,
  borderRadius: c.radius,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: c.border,
  paddingHorizontal: 16,
});
const inputStyle = (c: any) => ({
  color: c.foreground,
  fontFamily: "Inter_400Regular",
  fontSize: 16,
  paddingVertical: 14,
});
