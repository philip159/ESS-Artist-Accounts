import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Smartphone, Copy, Check, ExternalLink, ShieldAlert } from "lucide-react";

type FrameStyle = "black" | "white" | "natural";
type FrameType = "standard" | "box";

const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "natural", label: "Natural Wood" },
];

const FRAME_TYPES: { value: FrameType; label: string }[] = [
  { value: "standard", label: "Standard Frame (22mm)" },
  { value: "box", label: "Box Frame (33mm)" },
];

interface Artwork {
  id: string;
  title: string;
  artistName: string;
  lowResFileUrl: string | null;
  availableSizes: string[] | null;
  calculatedSizes: string[] | null;
}

export default function ARTest() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const accessToken = searchParams.get("token") || "";
  
  const [selectedArtworkId, setSelectedArtworkId] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("black");
  const [frameType, setFrameType] = useState<FrameType>("standard");
  const [copied, setCopied] = useState(false);

  const { data: artworks, isLoading: artworksLoading, error } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks/public-list", accessToken],
    queryFn: async () => {
      const res = await fetch(`/api/artworks/public-list?token=${encodeURIComponent(accessToken)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load artworks");
      }
      return res.json();
    },
    enabled: !!accessToken,
  });

  useEffect(() => {
    if (artworks && artworks.length > 0 && !selectedArtworkId) {
      const artworkWithImage = artworks.find(a => a.lowResFileUrl);
      if (artworkWithImage) {
        setSelectedArtworkId(artworkWithImage.id);
        const sizes = artworkWithImage.availableSizes || artworkWithImage.calculatedSizes || [];
        if (sizes.length > 0) {
          setSelectedSize(sizes[0]);
        }
      }
    }
  }, [artworks, selectedArtworkId]);

  useEffect(() => {
    if (selectedArtworkId && artworks) {
      const artwork = artworks.find(a => a.id === selectedArtworkId);
      const sizes = artwork?.availableSizes || artwork?.calculatedSizes || [];
      if (sizes.length > 0 && !sizes.includes(selectedSize)) {
        setSelectedSize(sizes[0]);
      }
    }
  }, [selectedArtworkId, artworks, selectedSize]);

  const selectedArtwork = artworks?.find(a => a.id === selectedArtworkId);
  const availableSizes = selectedArtwork?.availableSizes || selectedArtwork?.calculatedSizes || [];

  const mobileUrl = selectedArtworkId && selectedSize
    ? `${window.location.origin}/ar/${selectedArtworkId}?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}&frameType=${frameType}`
    : "";

  const qrCodeUrl = mobileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mobileUrl)}`
    : "";

  const handleCopy = async () => {
    if (mobileUrl) {
      await navigator.clipboard.writeText(mobileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!accessToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Access Token Required
            </CardTitle>
            <CardDescription>
              This page requires an access token to view. Please use the secure link provided by your administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The URL should look like: <code className="bg-muted px-1 rounded">/ar/test?token=YOUR_TOKEN</code>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (artworksLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              {(error as Error).message || "Invalid or expired access token."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">AR Frame Preview Test</h1>
          <p className="text-muted-foreground">
            Test augmented reality frame preview on iOS and Android devices
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Configure Preview</CardTitle>
              <CardDescription>Select artwork and frame options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Artwork</Label>
                <Select value={selectedArtworkId} onValueChange={setSelectedArtworkId}>
                  <SelectTrigger data-testid="select-artwork">
                    <SelectValue placeholder="Select artwork" />
                  </SelectTrigger>
                  <SelectContent>
                    {artworks?.map((artwork) => (
                      <SelectItem key={artwork.id} value={artwork.id}>
                        {artwork.title} - {artwork.artistName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Size</Label>
                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger data-testid="select-size">
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
                <Label>Frame Style</Label>
                <Select value={frameStyle} onValueChange={(v) => setFrameStyle(v as FrameStyle)}>
                  <SelectTrigger data-testid="select-frame-style">
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

              <div className="space-y-2">
                <Label>Frame Type</Label>
                <Select value={frameType} onValueChange={(v) => setFrameType(v as FrameType)}>
                  <SelectTrigger data-testid="select-frame-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAME_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Mobile AR Access
              </CardTitle>
              <CardDescription>
                Scan the QR code or copy the link to test on mobile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mobileUrl ? (
                <>
                  <div className="flex justify-center">
                    <img
                      src={qrCodeUrl}
                      alt="QR Code for AR preview"
                      className="w-48 h-48 rounded-lg border"
                      data-testid="img-ar-qrcode"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Direct Link</Label>
                    <div className="flex gap-2">
                      <Input
                        value={mobileUrl}
                        readOnly
                        className="text-xs"
                        data-testid="input-mobile-url"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        data-testid="button-copy-url"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(mobileUrl, "_blank")}
                        data-testid="button-open-url"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Select an artwork and size to generate QR code
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Testing Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">iOS (iPhone/iPad)</Badge>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Scan the QR code with your Camera app</li>
                  <li>Tap the notification to open Safari</li>
                  <li>Tap "View in Your Space" button</li>
                  <li>Point camera at a wall or flat surface</li>
                  <li>Tap to place the framed artwork</li>
                  <li>Walk around to see it from different angles</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  Uses Apple AR Quick Look - requires iOS 12+ with ARKit support
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Android</Badge>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Scan the QR code with Google Lens or Camera</li>
                  <li>Open the link in Chrome</li>
                  <li>Tap "View in your space" button</li>
                  <li>If prompted, allow camera access</li>
                  <li>Point at floor/wall and tap to place</li>
                  <li>Pinch to resize, drag to reposition</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  Uses Google Scene Viewer - requires Android 7.0+ with ARCore support
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device Compatibility</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Supported iOS Devices</h4>
                <ul className="text-muted-foreground space-y-1">
                  <li>iPhone 6s and later</li>
                  <li>iPad Pro (all models)</li>
                  <li>iPad (5th generation and later)</li>
                  <li>iPad Air (3rd generation and later)</li>
                  <li>iPad mini (5th generation and later)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Supported Android Devices</h4>
                <ul className="text-muted-foreground space-y-1">
                  <li>Google Pixel 2 and later</li>
                  <li>Samsung Galaxy S8 and later</li>
                  <li>OnePlus 6 and later</li>
                  <li>Most flagship phones from 2018+</li>
                  <li>Check ARCore supported devices list</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
