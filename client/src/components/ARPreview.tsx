import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, Loader2, View, Apple, Bot } from "lucide-react";
import { SiAndroid } from "react-icons/si";
import "@google/model-viewer";

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
          poster?: string;
        },
        HTMLElement
      >;
    }
  }
}

interface ARPreviewProps {
  artworkId: string;
  artworkTitle: string;
  artworkImageUrl: string;
  availableSizes: string[];
}

type FrameStyle = "black" | "white" | "natural";

const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "natural", label: "Natural Wood" },
];

export function ARPreview({ artworkId, artworkTitle, artworkImageUrl, availableSizes }: ARPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState(availableSizes[0] || "30x40cm");
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("black");
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const modelViewerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobile = /iphone|ipad|ipod|android/.test(userAgent);
    const ios = /iphone|ipad|ipod/.test(userAgent);
    setIsMobile(mobile);
    setIsIOS(ios);
  }, []);

  const modelUrl = `/api/artworks/${artworkId}/ar-model?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}`;

  const generateQRUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/ar/${artworkId}?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}`;
  };

  const handleARClick = () => {
    if (modelViewerRef.current) {
      (modelViewerRef.current as any).activateAR?.();
    }
  };

  // Direct AR launch for mobile - bypasses dialog and goes straight to native AR viewer
  const handleMobileARLaunch = () => {
    const baseUrl = window.location.origin;
    const glbUrl = `${baseUrl}/api/artworks/${artworkId}/ar-model?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}`;
    
    if (isIOS) {
      // iOS: Use Apple Quick Look with USDZ
      // We need to generate USDZ on the fly or redirect to the AR viewer page which handles this
      // For now, redirect to AR viewer page which has proper Quick Look integration
      window.location.href = `/ar/${artworkId}?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}&autoar=1`;
    } else {
      // Android: Use Google Scene Viewer with intent URL
      const sceneViewerUrl = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(glbUrl)}&mode=ar_only&title=${encodeURIComponent(artworkTitle)}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(glbUrl)};end;`;
      window.location.href = sceneViewerUrl;
    }
  };

  // Handle button click - direct AR on mobile, dialog on desktop
  const handleButtonClick = () => {
    if (isMobile) {
      handleMobileARLaunch();
    } else {
      setIsOpen(true);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleButtonClick}
        data-testid="button-ar-preview"
      >
        <View className="w-4 h-4 mr-2" />
        View in AR
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <View className="w-5 h-5" />
              AR Preview - {artworkTitle}
            </DialogTitle>
            <DialogDescription>
              Preview this artwork on your wall using augmented reality
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 3D Preview / Model Viewer */}
            <div className="space-y-4">
              <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                <model-viewer
                  ref={modelViewerRef}
                  src={modelUrl}
                  alt={`3D preview of ${artworkTitle}`}
                  ar
                  ar-modes="webxr scene-viewer quick-look"
                  ar-scale="fixed"
                  ar-placement="wall"
                  camera-controls
                  auto-rotate
                  shadow-intensity="1"
                  exposure="1"
                  environment-image="neutral"
                  style={{ width: "100%", height: "100%" }}
                  onLoad={() => setIsLoading(false)}
                  data-testid="model-viewer-ar"
                />
              </div>

              {/* Controls */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Print Size</Label>
                  <Select value={selectedSize} onValueChange={setSelectedSize}>
                    <SelectTrigger data-testid="select-ar-size">
                      <SelectValue />
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
                  <Label>Frame Style</Label>
                  <Select value={frameStyle} onValueChange={(v) => setFrameStyle(v as FrameStyle)}>
                    <SelectTrigger data-testid="select-ar-frame">
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

              {isMobile && (
                <Button
                  className="w-full"
                  onClick={handleARClick}
                  data-testid="button-launch-ar"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  {isIOS ? "View in Your Space" : "View in AR"}
                </Button>
              )}
            </div>

            {/* Desktop: QR Code for mobile */}
            {!isMobile && (
              <div className="space-y-4">
                <div className="text-center space-y-4 p-6 border rounded-lg bg-muted/50">
                  <QrCode className="w-16 h-16 mx-auto text-muted-foreground" />
                  <div className="space-y-2">
                    <h3 className="font-semibold">View on Mobile</h3>
                    <p className="text-sm text-muted-foreground">
                      Scan this QR code with your phone to see this artwork in your space using AR
                    </p>
                  </div>

                  {/* QR Code placeholder - we'll generate dynamically */}
                  <div className="bg-white p-4 rounded-lg inline-block mx-auto">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(generateQRUrl())}`}
                      alt="QR Code for AR preview"
                      className="w-48 h-48"
                      data-testid="img-ar-qrcode"
                    />
                  </div>

                  <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Badge variant="outline" className="gap-1">
                        <Apple className="w-3 h-3" />
                        iOS
                      </Badge>
                    </span>
                    <span className="flex items-center gap-1">
                      <Badge variant="outline" className="gap-1">
                        <SiAndroid className="w-3 h-3" />
                        Android
                      </Badge>
                    </span>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground space-y-2">
                  <p className="font-medium">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Scan the QR code with your phone camera</li>
                    <li>Open the link in your browser</li>
                    <li>Tap "View in AR" to place the artwork</li>
                    <li>Point your camera at a wall to preview</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
