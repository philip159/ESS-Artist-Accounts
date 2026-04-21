import { useEffect, useState, useRef } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, View, ArrowLeft } from "lucide-react";
import "@google/model-viewer";

interface ARInfo {
  id: string;
  title: string;
  artistName: string;
  availableSizes: string[];
  lowResFileUrl: string | null;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          "ios-src"?: string;
          alt?: string;
          ar?: boolean;
          "ar-modes"?: string;
          "ar-scale"?: string;
          "ar-placement"?: string;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "shadow-intensity"?: string;
          exposure?: string;
          "environment-image"?: string;
        },
        HTMLElement
      >;
    }
  }
}

type FrameStyle = "black" | "white" | "natural";
type FrameType = "standard" | "box";

const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "natural", label: "Natural Wood" },
];

export default function ARViewer() {
  const params = useParams<{ id: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  
  const initialSize = searchParams.get("size") || "";
  const initialFrame = (searchParams.get("frame") as FrameStyle) || "black";
  const initialFrameType = (searchParams.get("frameType") as FrameType) || "standard";
  const autoAR = searchParams.get("autoar") === "1";
  
  const [selectedSize, setSelectedSize] = useState(initialSize);
  const [frameStyle, setFrameStyle] = useState<FrameStyle>(initialFrame);
  const [frameType, setFrameType] = useState<FrameType>(initialFrameType);
  const [isLoading, setIsLoading] = useState(true);
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [autoARTriggered, setAutoARTriggered] = useState(false);
  const modelViewerRef = useRef<HTMLElement>(null);

  const { data: artwork, isLoading: artworkLoading } = useQuery<ARInfo>({
    queryKey: [`/api/artworks/${params.id}/ar-info`],
    enabled: !!params.id,
  });

  useEffect(() => {
    if (artwork && !selectedSize) {
      const sizes = artwork.availableSizes || [];
      if (sizes.length > 0) {
        setSelectedSize(sizes[0]);
      }
    }
  }, [artwork, selectedSize]);

  useEffect(() => {
    const checkARSupport = async () => {
      if ("xr" in navigator) {
        try {
          const supported = await (navigator as any).xr?.isSessionSupported?.("immersive-ar");
          setArSupported(!!supported);
        } catch {
          setArSupported(false);
        }
      } else {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const isAndroid = /android/i.test(navigator.userAgent);
        setArSupported(isIOS || isAndroid);
      }
    };
    checkARSupport();
  }, []);

  // Handle model-viewer load event with callback ref
  const handleModelViewerRef = (el: HTMLElement | null) => {
    if (!el) return;
    (modelViewerRef as any).current = el;
    
    const handleLoad = () => {
      setIsLoading(false);
      // Auto-trigger AR if requested via URL parameter
      if (autoAR && !autoARTriggered) {
        setAutoARTriggered(true);
        // Small delay to ensure model-viewer is ready
        setTimeout(() => {
          (el as any).activateAR?.();
        }, 500);
      }
    };
    el.addEventListener("load", handleLoad);
    
    // Fallback: hide loading after timeout if model takes too long
    setTimeout(() => setIsLoading(false), 5000);
  };

  // Reset loading when settings change
  useEffect(() => {
    if (selectedSize && frameStyle) {
      setIsLoading(true);
      // Fallback timeout for new model loads
      const timeout = setTimeout(() => setIsLoading(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [selectedSize, frameStyle]);

  if (artworkLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!artwork) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-6 text-center">
          <h1 className="text-xl font-semibold mb-2">Artwork Not Found</h1>
          <p className="text-muted-foreground">This artwork may have been removed.</p>
        </Card>
      </div>
    );
  }

  const availableSizes = artwork.availableSizes || [];
  const modelUrl = `/api/artworks/${params.id}/ar-model?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}&frameType=${frameType}`;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="p-4 border-b flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">{artwork.title}</h1>
          <p className="text-sm text-muted-foreground truncate">by {artwork.artistName}</p>
        </div>
      </header>

      {/* Model Viewer - fills available space */}
      <div className="flex-1 relative bg-muted min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <model-viewer
          ref={handleModelViewerRef as any}
          src={modelUrl}
          alt={`3D preview of ${artwork.title}`}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          ar-placement="wall"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          exposure="1"
          environment-image="neutral"
          style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
          data-testid="model-viewer-mobile"
        >
          <Button
            slot="ar-button"
            className="absolute bottom-4 left-1/2 -translate-x-1/2"
            size="lg"
            data-testid="button-ar-mobile"
          >
            <View className="w-5 h-5 mr-2" />
            View in Your Space
          </Button>
        </model-viewer>
      </div>

      {/* Controls */}
      <div className="p-4 border-t bg-background space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Size</Label>
            <Select value={selectedSize} onValueChange={setSelectedSize}>
              <SelectTrigger data-testid="select-mobile-size">
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                {availableSizes.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Frame</Label>
            <Select value={frameStyle} onValueChange={(v) => setFrameStyle(v as FrameStyle)}>
              <SelectTrigger data-testid="select-mobile-frame">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRAME_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {arSupported === false && (
          <p className="text-sm text-muted-foreground text-center">
            AR is not supported on this device. Use the 3D preview above to explore the artwork.
          </p>
        )}
      </div>
    </div>
  );
}
