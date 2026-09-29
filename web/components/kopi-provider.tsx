"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getApi, TOKEN_KEY, type KopiApi, type Profile } from "@/lib/api";
import { ACTIVE_PROFILE_KEY, PROFILES_KEY, SEEDED_PROFILES } from "@/lib/profiles";

type Session = "checking" | "signed-out" | "signed-in" | "unreachable";

type KopiContext = {
  api: KopiApi | null;
  session: Session;
  signIn: (code: string) => Promise<void>;
  signOut: () => void;
  profiles: Profile[];
  profile: Profile;
  setProfile: (id: string) => void;
  saveProfile: (profile: Profile) => void;
};

const Context = createContext<KopiContext | null>(null);

function readProfiles(): Profile[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "null") as Profile[] | null;
    return saved?.length ? saved : SEEDED_PROFILES;
  } catch {
    return SEEDED_PROFILES;
  }
}

export function KopiProvider({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<KopiApi | null>(null);
  const [session, setSession] = useState<Session>("checking");
  const [profiles, setProfiles] = useState<Profile[]>(SEEDED_PROFILES);
  const [activeId, setActiveId] = useState<string>(SEEDED_PROFILES[0].id);

  useEffect(() => {
    // localStorage only exists after hydration; the seeded profiles render first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfiles(readProfiles());
    setActiveId(localStorage.getItem(ACTIVE_PROFILE_KEY) ?? SEEDED_PROFILES[0].id);
  }, []);

  useEffect(() => {
    let live = true;
    getApi().then(async (client) => {
      if (!live) return;
      setApi(client);
      try {
        const { auth } = await client.health();
        if (live) setSession(!auth || sessionStorage.getItem(TOKEN_KEY) ? "signed-in" : "signed-out");
      } catch {
        if (live) setSession("unreachable");
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const signIn = useCallback(
    async (code: string) => {
      if (!api) return;
      const { token } = await api.auth(code);
      sessionStorage.setItem(TOKEN_KEY, token);
      setSession("signed-in");
    },
    [api],
  );

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setSession("signed-out");
  }, []);

  const setProfile = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    setActiveId(id);
  }, []);

  const saveProfile = useCallback((next: Profile) => {
    setProfiles((current) => {
      const updated = current.some((p) => p.id === next.id) ? current.map((p) => (p.id === next.id ? next : p)) : [...current, next];
      localStorage.setItem(PROFILES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const profile = profiles.find((p) => p.id === activeId) ?? profiles[0];

  const value = useMemo(
    () => ({ api, session, signIn, signOut, profiles, profile, setProfile, saveProfile }),
    [api, session, signIn, signOut, profiles, profile, setProfile, saveProfile],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useKopi(): KopiContext {
  const context = useContext(Context);
  if (!context) throw new Error("useKopi must be used inside <KopiProvider>");
  return context;
}

/** The API client once it is ready and the person is signed in; null until then. */
export function useApi(): KopiApi | null {
  const { api, session } = useKopi();
  return session === "signed-in" ? api : null;
}
