import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface CertificateOfAuthenticityPreviewProps {
  artworkTitle: string;
  artistName: string;
  editionSize: number;
  signatureSrc?: string;
  artworkPreview: string;
}

async function blobUrlToDataUrl(blobUrl: string): Promise<string | null> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function CertificateOfAuthenticityPreview({
  artworkTitle,
  artistName,
  editionSize,
  signatureSrc,
  artworkPreview,
}: CertificateOfAuthenticityPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestKey = useMemo(() => {
    return `${artworkTitle}-${artistName}-${editionSize}-${signatureSrc || ''}-${artworkPreview || ''}`;
  }, [artworkTitle, artistName, editionSize, signatureSrc, artworkPreview]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const generatePreview = async () => {
      if (!artworkTitle && !artistName) {
        setPreviewUrl(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let signatureDataUrl: string | null = null;
        let artworkPreviewDataUrl: string | null = null;
        
        if (signatureSrc) {
          if (signatureSrc.startsWith('blob:')) {
            signatureDataUrl = await blobUrlToDataUrl(signatureSrc);
          } else if (signatureSrc.startsWith('data:')) {
            signatureDataUrl = signatureSrc;
          }
        }

        if (artworkPreview) {
          if (artworkPreview.startsWith('blob:')) {
            artworkPreviewDataUrl = await blobUrlToDataUrl(artworkPreview);
          } else if (artworkPreview.startsWith('data:')) {
            artworkPreviewDataUrl = artworkPreview;
          }
        }

        const response = await fetch('/api/coa-form-preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            artworkTitle: artworkTitle || 'Untitled',
            artistName: artistName || 'Artist',
            editionSize: editionSize || 50,
            signatureDataUrl,
            artworkPreviewDataUrl,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to generate preview');
        }

        const blob = await response.blob();
        
        if (!cancelled) {
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
          }
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
        }
      } catch (err) {
        if (!cancelled && err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to generate COA preview:', err);
          setError('Failed to generate preview');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const debounceTimer = setTimeout(generatePreview, 500);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(debounceTimer);
    };
  }, [requestKey]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  return (
    <Card className="p-4 mt-4 overflow-hidden" data-testid="coa-preview">
      <div className="flex justify-center">
        <div
          className="relative rounded-lg overflow-hidden shadow-sm bg-muted"
          style={{
            width: '400px',
            height: '282px',
          }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {error && !previewUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          )}
          
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Certificate of Authenticity Preview"
              className="w-full h-full object-contain"
              data-testid="coa-preview-image"
            />
          )}
          
          {!previewUrl && !isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Enter artwork details to preview COA</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
