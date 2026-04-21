import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import "@google/model-viewer";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "camera-controls"?: boolean;
          "shadow-intensity"?: string;
          exposure?: string;
          "camera-orbit"?: string;
          loading?: "auto" | "lazy" | "eager";
        },
        HTMLElement
      >;
    }
  }
}

export default function HangerPositioner() {
  const [rotX, setRotX] = useState(-90);
  const [rotY, setRotY] = useState(-89);
  const [rotZ, setRotZ] = useState(180);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(25);
  const [posZ, setPosZ] = useState(-5);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelKey, setModelKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const modelViewerRef = useRef<HTMLElement | null>(null);

  const generateModel = async () => {
    setIsLoading(true);
    
    // Revoke previous blob URL to free memory
    if (modelUrl && modelUrl.startsWith('blob:')) {
      URL.revokeObjectURL(modelUrl);
    }
    
    const params = new URLSearchParams({
      size: "A3",
      frame: "black",
      mount: "50",
      frameType: "standard",
      hangerRotX: rotX.toString(),
      hangerRotY: rotY.toString(),
      hangerRotZ: rotZ.toString(),
      hangerPosX: posX.toString(),
      hangerPosY: posY.toString(),
      hangerPosZ: posZ.toString(),
    });
    
    try {
      const response = await fetch(`/api/ar/test-hanger?${params.toString()}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      setModelUrl(blobUrl);
      setModelKey(k => k + 1);
    } catch (error) {
      console.error('Failed to load model:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    generateModel();
  }, []);

  useEffect(() => {
    const viewer = modelViewerRef.current;
    if (viewer) {
      const handleLoad = () => setIsLoading(false);
      viewer.addEventListener('load', handleLoad);
      return () => viewer.removeEventListener('load', handleLoad);
    }
  }, [modelUrl]);

  const copyToClipboard = () => {
    const code = `// Hanger positioning values
const HANGER_ROT_X_DEG = ${rotX};
const HANGER_ROT_Y_DEG = ${rotY};
const HANGER_ROT_Z_DEG = ${rotZ};
const HANGER_POS_X_OFFSET = ${(posX / 1000).toFixed(4)};  // ${posX}mm
const HANGER_POS_Y_OFFSET = ${(posY / 1000).toFixed(4)};  // ${posY}mm
const HANGER_POS_Z_OFFSET = ${(posZ / 1000).toFixed(4)}; // ${posZ}mm`;
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Hanger Position Tool</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Card className="h-[600px]">
              <CardContent className="p-0 h-full relative">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {modelUrl && (
                  <model-viewer
                    key={modelKey}
                    ref={(el) => { modelViewerRef.current = el; }}
                    src={modelUrl}
                    alt="Frame with hanger"
                    camera-controls
                    shadow-intensity="0.5"
                    exposure="1"
                    camera-orbit="180deg 90deg 1m"
                    loading="eager"
                    style={{ width: "100%", height: "100%" }}
                    data-testid="model-viewer-hanger"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Rotation (degrees)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>X: {rotX}°</Label>
                  <Slider
                    value={[rotX]}
                    onValueChange={([v]) => setRotX(v)}
                    min={-180}
                    max={180}
                    step={0.1}
                    data-testid="slider-rot-x"
                  />
                </div>
                <div>
                  <Label>Y: {rotY}°</Label>
                  <Slider
                    value={[rotY]}
                    onValueChange={([v]) => setRotY(v)}
                    min={-180}
                    max={180}
                    step={0.1}
                    data-testid="slider-rot-y"
                  />
                </div>
                <div>
                  <Label>Z: {rotZ}°</Label>
                  <Slider
                    value={[rotZ]}
                    onValueChange={([v]) => setRotZ(v)}
                    min={-180}
                    max={180}
                    step={0.1}
                    data-testid="slider-rot-z"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Position (mm)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>X: {posX}mm</Label>
                  <Slider
                    value={[posX]}
                    onValueChange={([v]) => setPosX(v)}
                    min={-100}
                    max={100}
                    step={1}
                    data-testid="slider-pos-x"
                  />
                </div>
                <div>
                  <Label>Y: {posY}mm</Label>
                  <Slider
                    value={[posY]}
                    onValueChange={([v]) => setPosY(v)}
                    min={-100}
                    max={200}
                    step={1}
                    data-testid="slider-pos-y"
                  />
                </div>
                <div>
                  <Label>Z: {posZ}mm</Label>
                  <Slider
                    value={[posZ]}
                    onValueChange={([v]) => setPosZ(v)}
                    min={-50}
                    max={50}
                    step={1}
                    data-testid="slider-pos-z"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button onClick={generateModel} className="flex-1" data-testid="button-apply">
                Apply Changes
              </Button>
              <Button onClick={copyToClipboard} variant="outline" data-testid="button-copy">
                Copy Code
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Values</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
{`rotX=${rotX}° rotY=${rotY}° rotZ=${rotZ}°
posX=${posX}mm posY=${posY}mm posZ=${posZ}mm`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
