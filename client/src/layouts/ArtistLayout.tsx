import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ArtistSidebar } from "@/components/ArtistSidebar";
import { Loader2 } from "lucide-react";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useArtistAuth } from "@/contexts/ArtistAuthContext";

const SIDEBAR_STYLE = {
  "--sidebar-width": "15rem",
  "--sidebar-width-icon": "3.5rem",
};

export function ArtistLayout({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const { isImpersonating, isLoading: impersonationLoading } = useImpersonation();
  const { user, isLoading: authLoading } = useArtistAuth();

  const isLoading = isImpersonating ? impersonationLoading : authLoading;

  useEffect(() => {
    if (!isLoading && !isImpersonating && !user) {
      navigate("/artist/login");
    }
  }, [isLoading, isImpersonating, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <Loader2 className="h-7 w-7 animate-spin text-neutral-300" />
      </div>
    );
  }

  if (!isImpersonating && !user) {
    return null;
  }

  return (
    <SidebarProvider style={SIDEBAR_STYLE as React.CSSProperties}>
      <div className="flex h-screen w-full bg-neutral-50/50">
        <ArtistSidebar />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Minimal top bar — only the sidebar toggle on mobile/when collapsed */}
          <header className="flex items-center h-12 px-4 border-b border-neutral-200/70 bg-white shrink-0">
            <SidebarTrigger
              className="text-neutral-400 hover:text-neutral-700 transition-colors"
              data-testid="button-sidebar-toggle"
            />
          </header>

          <main className="flex-1 overflow-auto bg-neutral-50/50">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
