import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface AuthCheck {
  isAuthenticated: boolean;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  
  const { data: authStatus, isLoading } = useQuery<AuthCheck>({
    queryKey: ["/api/auth/check"],
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
  });

  useEffect(() => {
    if (!isLoading && !authStatus?.isAuthenticated) {
      navigate("/admin/login");
    }
  }, [authStatus, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!authStatus?.isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
