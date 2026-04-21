import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { FramedMockup, DEFAULT_PREVIEW_CONFIG, type PreviewConfig, type FrameFinish } from '@/components/FramedMockup';
import testArtwork from '@assets/Victoria Benjafield_A-Ratio_Rock, Cornwall II_1763596859349.jpg';

const FRAME_SIZES = [
  { id: 'A1', label: 'A1 - 23.4" x 33.1"', widthMm: 594, heightMm: 841 },
  { id: 'A2', label: 'A2 - 16.5" x 23.4"', widthMm: 420, heightMm: 594 },
  { id: 'A3', label: 'A3 - 11.7" x 16.5"', widthMm: 297, heightMm: 420 },
  { id: 'A4', label: 'A4 - 8.3" x 11.7"', widthMm: 210, heightMm: 297 },
  { id: '20x28', label: '20x28"', widthMm: 508, heightMm: 711.2 },
] as const;

const FINISHES = [
  { id: 'gloss', label: 'Gloss', color: '#1a1a2e' },
  { id: 'matte', label: 'Matte', color: '#2d2d44' },
  { id: 'natural', label: 'Natural Wood', color: '#8b7355' },
  { id: 'white', label: 'White Wood', color: '#f5f5f0' },
] as const;

// Map preview finishes to internal frame types
const FINISH_TO_FRAME_MAP: Record<typeof FINISHES[number]['id'], FrameFinish> = {
  gloss: 'black',
  matte: 'black',
  natural: 'oak',
  white: 'white',
};

const STORAGE_KEY = 'framePreviewConfig';

function loadConfig(): PreviewConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_PREVIEW_CONFIG;
  } catch {
    return DEFAULT_PREVIEW_CONFIG;
  }
}

export default function FramePreview() {
  const [selectedSize, setSelectedSize] = useState<string>(FRAME_SIZES[0].id);
  const [selectedFinish, setSelectedFinish] = useState<typeof FINISHES[number]['id']>('gloss');
  const [config, setConfig] = useState<PreviewConfig>(loadConfig);

  // Persist config to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const updateConfig = (key: keyof PreviewConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_PREVIEW_CONFIG);
  };

  const printSize = FRAME_SIZES.find(s => s.id === selectedSize) || FRAME_SIZES[0];
  const finish = FINISHES.find(f => f.id === selectedFinish) || FINISHES[0];
  const mappedFrameFinish = FINISH_TO_FRAME_MAP[selectedFinish];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Frame Preview Test</h1>
          <p className="text-muted-foreground">
            Test frame rendering without uploading
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8">
          {/* Controls */}
          <Card className="p-6 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Frame Settings</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={resetConfig}
                data-testid="button-reset"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Frame Size</Label>
              <Select value={selectedSize} onValueChange={setSelectedSize}>
                <SelectTrigger data-testid="select-frame-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAME_SIZES.map((size) => (
                    <SelectItem key={size.id} value={size.id}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Frame Finish</Label>
              <div className="grid grid-cols-2 gap-2">
                {FINISHES.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFinish(f.id)}
                    data-testid={`button-finish-${f.id}`}
                    className={`p-4 rounded-md border-2 transition-all hover-elevate ${
                      selectedFinish === f.id
                        ? 'border-primary'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-sm border border-border"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="text-sm font-medium">{f.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <h3 className="font-semibold">Preview Parameters</h3>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Preview Boost</Label>
                  <span className="text-sm text-muted-foreground">{config.previewBoost.toFixed(1)}</span>
                </div>
                <Slider
                  value={[config.previewBoost]}
                  onValueChange={([v]) => updateConfig('previewBoost', v)}
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  data-testid="slider-preview-boost"
                />
                <p className="text-xs text-muted-foreground">Controls base canvas fill</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Max Visual Scale</Label>
                  <span className="text-sm text-muted-foreground">{config.maxVisualScale.toFixed(2)}</span>
                </div>
                <Slider
                  value={[config.maxVisualScale]}
                  onValueChange={([v]) => updateConfig('maxVisualScale', v)}
                  min={0.10}
                  max={0.25}
                  step={0.01}
                  data-testid="slider-max-visual-scale"
                />
                <p className="text-xs text-muted-foreground">Upper clamp to prevent overflow</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Shadow Offset</Label>
                  <span className="text-sm text-muted-foreground">{config.shadowOffsetBase}</span>
                </div>
                <Slider
                  value={[config.shadowOffsetBase]}
                  onValueChange={([v]) => updateConfig('shadowOffsetBase', v)}
                  min={0}
                  max={12}
                  step={1}
                  data-testid="slider-shadow-offset"
                />
                <p className="text-xs text-muted-foreground">Shadow distance from frame</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Shadow Blur</Label>
                  <span className="text-sm text-muted-foreground">{config.shadowBlurBase}</span>
                </div>
                <Slider
                  value={[config.shadowBlurBase]}
                  onValueChange={([v]) => updateConfig('shadowBlurBase', v)}
                  min={0}
                  max={30}
                  step={1}
                  data-testid="slider-shadow-blur"
                />
                <p className="text-xs text-muted-foreground">Shadow softness</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Shadow Opacity</Label>
                  <span className="text-sm text-muted-foreground">{config.shadowOpacity.toFixed(2)}</span>
                </div>
                <Slider
                  value={[config.shadowOpacity]}
                  onValueChange={([v]) => updateConfig('shadowOpacity', v)}
                  min={0}
                  max={0.6}
                  step={0.01}
                  data-testid="slider-shadow-opacity"
                />
                <p className="text-xs text-muted-foreground">Shadow darkness</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Frame Lip Multiplier</Label>
                  <span className="text-sm text-muted-foreground">{config.frameLipMultiplier.toFixed(1)}</span>
                </div>
                <Slider
                  value={[config.frameLipMultiplier]}
                  onValueChange={([v]) => updateConfig('frameLipMultiplier', v)}
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  data-testid="slider-frame-lip"
                />
                <p className="text-xs text-muted-foreground">Inner bevel intensity</p>
              </div>
            </div>

            <div className="pt-4 border-t space-y-2">
              <h3 className="font-semibold">Artwork Info</h3>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>Dimensions: 7016 × 9933px</p>
                <p>DPI: 300</p>
                <p>Aspect Ratio: 0.706 (Portrait)</p>
              </div>
            </div>
          </Card>

          {/* Preview */}
          <Card className="p-6">
            <div className="space-y-4">
              <h3 className="font-semibold">Website Preview</h3>
              <div className="bg-muted/30 rounded-lg p-8 min-h-[600px] flex items-center justify-center">
                <FramedMockup
                  imageUrl={testArtwork}
                  title="A-Ratio Rock, Cornwall II"
                  artistName="Arty Guava"
                  availableSizes={[selectedSize]}
                  widthPx={7016}
                  heightPx={9933}
                  dpi={300}
                  previewConfig={config}
                  frameFinish={mappedFrameFinish}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
