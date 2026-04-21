import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DropboxHealth {
  connected: boolean;
  error?: string;
}

export function DropboxStatus() {
  const { data: health, isLoading, error } = useQuery<DropboxHealth>({
    queryKey: ["/api/integrations/dropbox/health"],
    refetchInterval: 60000, // Check every minute
    retry: false,
  });

  // Don't show anything while loading
  if (isLoading) {
    return null;
  }

  // If there's any error, log it but don't show alert
  if (error) {
    console.error('[DropboxStatus] Failed to check Dropbox health:', error);
    return null;
  }

  // Only show alert when health check succeeded but connection is disconnected
  if (!health || health.connected) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-6" data-testid="alert-dropbox-disconnected">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Dropbox Integration Disconnected</AlertTitle>
      <AlertDescription>
        {health.error || "The Dropbox integration needs to be reconnected."}
        <br />
        <span className="font-medium">
          Go to the Replit integrations panel and click "Manage" next to Dropbox to reconnect.
        </span>
        <br />
        <span className="text-sm text-muted-foreground mt-2 block">
          Artwork uploads will fail until this is resolved.
        </span>
      </AlertDescription>
    </Alert>
  );
}
