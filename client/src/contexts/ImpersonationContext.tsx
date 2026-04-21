import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { ArtistAccount } from "@shared/schema";

interface ImpersonationContextType {
  isImpersonating: boolean;
  artistId: string | null;
  artistProfile: ArtistAccount | null;
  isLoading: boolean;
  exitImpersonation: () => void;
  apiPrefix: string;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  isImpersonating: false,
  artistId: null,
  artistProfile: null,
  isLoading: false,
  exitImpersonation: () => {},
  apiPrefix: "/api/artist",
});

export function useImpersonation() {
  return useContext(ImpersonationContext);
}

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  
  const { isImpersonating, artistId } = useMemo(() => {
    const match = location.match(/^\/admin\/view-artist\/([^/]+)/);
    if (match) {
      return { isImpersonating: true, artistId: match[1] };
    }
    return { isImpersonating: false, artistId: null };
  }, [location]);

  const { data: artistProfile, isLoading } = useQuery<ArtistAccount>({
    queryKey: ["/api/admin/artist-accounts", artistId, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/artist-accounts/${artistId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch artist");
      return res.json();
    },
    enabled: isImpersonating && !!artistId,
  });

  const exitImpersonation = () => {
    navigate("/admin/artists");
  };

  const apiPrefix = isImpersonating && artistId 
    ? `/api/admin/view-artist/${artistId}` 
    : "/api/artist";

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating,
        artistId,
        artistProfile: artistProfile || null,
        isLoading,
        exitImpersonation,
        apiPrefix,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
