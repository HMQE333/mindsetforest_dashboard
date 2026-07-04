import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/hooks/useAuth";

export function AuthScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    if (mode === "signin") {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error);
    } else {
      const { error, needsConfirm } = await signUp(email.trim(), password);
      if (error) setError(error);
      else if (needsConfirm) setMessage("Check your email to confirm your account, then sign in.");
    }
    setBusy(false);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 28, paddingTop: topPad + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", marginBottom: 36 }}>
            <LinearGradient
              colors={["#8b5cf6", "#6467f1"]}
              style={{ width: 78, height: 78, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 20 }}
            >
              <Feather name="compass" size={38} color="#fff" />
            </LinearGradient>
            <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 28 }}>MindsetForest</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 6 }}>
              Your Life. Your Quest.
            </Text>
          </View>

          <View style={{ gap: 14 }}>
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                testID="auth-email"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{ color: c.foreground, fontFamily: "Inter_400Regular", fontSize: 16, paddingVertical: 15 }}
              />
            </View>
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                testID="auth-password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={c.mutedForeground}
                secureTextEntry
                style={{ color: c.foreground, fontFamily: "Inter_400Regular", fontSize: 16, paddingVertical: 15 }}
              />
            </View>

            {error ? (
              <Text style={{ color: c.destructive, fontFamily: "Inter_500Medium", fontSize: 13 }}>{error}</Text>
            ) : null}
            {message ? (
              <Text style={{ color: "#22c55e", fontFamily: "Inter_500Medium", fontSize: 13 }}>{message}</Text>
            ) : null}

            <PrimaryButton
              testID="auth-submit"
              label={mode === "signin" ? "Sign In" : "Create Account"}
              onPress={submit}
              loading={busy}
            />

            <Text
              onPress={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setMessage(null);
              }}
              style={{
                color: c.primary,
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                textAlign: "center",
                marginTop: 6,
              }}
            >
              {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
