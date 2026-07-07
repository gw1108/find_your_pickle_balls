import type { Session } from "@supabase/supabase-js";
import type { Sport, SkillLevel } from "@pickup/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabase";

/** Own profile row (includes private columns like birthdate). */
export type MyProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  sports: Sport[];
  skill_levels: Partial<Record<Sport, SkillLevel>>;
  ig_handle: string | null;
  ghost_mode: boolean;
  birthdate: string;
};

/** The signup trigger stubs profiles with this placeholder DOB; the app must
 * collect the real one before the profile is usable (18+ gate, §8). */
const PLACEHOLDER_BIRTHDATE = "1900-01-01";

type AuthContextValue = {
  session: Session | null;
  /** Undefined while the initial session/profile load is in flight. */
  loading: boolean;
  profile: MyProfile | null;
  needsOnboarding: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_url, bio, sports, skill_levels, ig_handle, ghost_mode, birthdate"
      )
      .eq("id", userId)
      .maybeSingle();
    if (!error) setProfile((data as MyProfile) ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      if (!cancelled) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) {
        loadProfile(next.user.id);
      } else {
        setProfile(null);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const needsOnboarding =
    !!session && (profile === null || profile.birthdate === PLACEHOLDER_BIRTHDATE);

  return (
    <AuthContext.Provider
      value={{ session, loading, profile, needsOnboarding, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
