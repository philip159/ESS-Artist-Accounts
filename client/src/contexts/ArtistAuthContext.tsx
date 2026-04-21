import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface ArtistAuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
}

const ArtistAuthContext = createContext<ArtistAuthContextValue | null>(null);

export function ArtistAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const getAccessToken = () => {
    return session?.access_token ?? null;
  };

  return (
    <ArtistAuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </ArtistAuthContext.Provider>
  );
}

export function useArtistAuth() {
  const ctx = useContext(ArtistAuthContext);
  if (!ctx) {
    throw new Error("useArtistAuth must be used inside ArtistAuthProvider");
  }
  return ctx;
}
