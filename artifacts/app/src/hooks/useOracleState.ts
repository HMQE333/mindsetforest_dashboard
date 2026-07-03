import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";

interface PurchasedReward {
  id: string;
  name: string;
  cost: number;
  date: string;
}

export interface OracleState {
  oracleXP: number;
  totalXPSacrificed: number;
  rewardsPurchased: PurchasedReward[];
}

const defaultState: OracleState = {
  oracleXP: 0,
  totalXPSacrificed: 0,
  rewardsPurchased: [],
};

export function useOracleState() {
  const { user } = useAuth();
  const [state, setState] = useState<OracleState>(defaultState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      const { data } = await supabase
        .from("oracle_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setState({
          oracleXP: data.oracle_xp,
          totalXPSacrificed: data.total_xp_sacrificed,
          rewardsPurchased: (data.rewards_purchased as unknown as PurchasedReward[]) || [],
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const persist = useCallback(async (s: OracleState) => {
    if (!user) return;
    const { error } = await supabase.from("oracle_state").upsert([{
      user_id: user.id,
      oracle_xp: s.oracleXP,
      total_xp_sacrificed: s.totalXPSacrificed,
      rewards_purchased: s.rewardsPurchased as unknown as Record<string, never>,
    }], { onConflict: "user_id" });
    if (error) toast({ title: "Save failed", description: "Could not save oracle state.", variant: "destructive" });
  }, [user]);

  const sacrificeXP = useCallback((amount: number): boolean => {
    // Returns true if sacrifice was accepted (caller must deduct from dashboard)
    let accepted = false;
    setState(prev => {
      const next: OracleState = {
        ...prev,
        oracleXP: prev.oracleXP + amount,
        totalXPSacrificed: prev.totalXPSacrificed + amount,
      };
      persist(next);
      accepted = true;
      return next;
    });
    return accepted;
  }, [persist]);

  const purchaseReward = useCallback((rewardId: string, rewardName: string, cost: number): boolean => {
    let success = false;
    setState(prev => {
      if (prev.oracleXP < cost) return prev;
      const purchase: PurchasedReward = {
        id: rewardId,
        name: rewardName,
        cost,
        date: new Date().toISOString(),
      };
      const next: OracleState = {
        ...prev,
        oracleXP: prev.oracleXP - cost,
        rewardsPurchased: [...prev.rewardsPurchased, purchase],
      };
      persist(next);
      success = true;
      return next;
    });
    return success;
  }, [persist]);

  return { state, loading, sacrificeXP, purchaseReward };
}
