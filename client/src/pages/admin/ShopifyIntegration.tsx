import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Check } from "lucide-react";
import { useState } from "react";

export default function ShopifyIntegration() {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  const baseUrl = typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}`
    : 'https://your-app-url.replit.app';

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const widgetCode = `<!-- East Side Studio AR Widget -->
<div class="eastside-ar-container" 
     data-wav-image="{{ product.metafields.custom.wav_image.url }}"
     data-size="{{ product.selected_or_first_available_variant.option1 }}"
     data-frame="{{ product.selected_or_first_available_variant.option2 }}"
     data-title="{{ product.title }}">
</div>
<script src="${baseUrl}/shopify-ar-widget.js" defer></script>`;

  const metafieldCode = `Metafield name: wav_image
Type: File
Namespace: custom (default)

The wav_image metafield stores a low-res version of the artwork
for use in the AR viewer. Upload images to Shopify Files first.`;

  const liquidVariantCode = `{% if product.metafields.custom.wav_image %}
<div class="eastside-ar-container" 
     id="ar-viewer-{{ product.id }}"
     data-wav-image="{{ product.metafields.custom.wav_image.url }}"
     data-size="{{ product.selected_or_first_available_variant.option1 | default: '30x40cm' }}"
     data-frame="{{ product.selected_or_first_available_variant.option2 | default: 'natural' }}"
     data-title="{{ product.title | escape }}">
</div>
<script>
  // Update AR button when variant changes
  document.addEventListener('change', function(e) {
    if (e.target.matches('[name="id"], .variant-selector')) {
      var container = document.getElementById('ar-viewer-{{ product.id }}');
      var selected = document.querySelector('[name="id"]:checked, select[name="id"]');
      if (container && selected) {
        var variant = selected.closest('[data-variant-options]');
        if (variant) {
          container.dataset.size = variant.dataset.option1 || container.dataset.size;
          container.dataset.frame = variant.dataset.option2 || container.dataset.frame;
        }
      }
    }
  });
</script>
<script src="${baseUrl}/shopify-ar-widget.js" defer></script>
{% endif %}`;

  const apiExample = `// Direct API call example
const arModelUrl = '${baseUrl}/api/ar/generate?' + new URLSearchParams({
  imageUrl: 'https://your-cdn.com/artwork.jpg',
  size: '30x40cm',
  frame: 'natural',
  mount: '0'
});

// Open AR viewer
window.open('${baseUrl}/ar/shopify?' + new URLSearchParams({
  imageUrl: 'https://your-cdn.com/artwork.jpg',
  size: '30x40cm',
  frame: 'natural',
  title: 'My Artwork'
}));`;

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Shopify AR Integration</h1>
        <p className="text-muted-foreground">
          Add "View in Your Space" AR functionality to your Shopify product pages
        </p>
      </div>

      <Tabs defaultValue="quick-start" className="space-y-6">
        <TabsList data-testid="tabs-shopify-integration">
          <TabsTrigger value="quick-start" data-testid="tab-quick-start">Quick Start</TabsTrigger>
          <TabsTrigger value="advanced" data-testid="tab-advanced">Advanced Setup</TabsTrigger>
          <TabsTrigger value="api" data-testid="tab-api">API Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="quick-start" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge>Step 1</Badge>
                Create Artwork Metafield
              </CardTitle>
              <CardDescription>
                Store the low-resolution artwork URL as a product metafield
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to <strong>Settings → Custom data → Products</strong> in Shopify admin</li>
                <li>Click <strong>Add definition</strong></li>
                <li>Set name to <code className="bg-muted px-1 py-0.5 rounded">wav_image</code></li>
                <li>Set type to <strong>File</strong> (accepts images)</li>
                <li>Save the definition</li>
              </ol>
              
              <div className="bg-muted rounded-lg p-4 relative">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{metafieldCode}</pre>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
                <strong>Note:</strong> This metafield may already exist in your store. 
                Check your product metafields before creating a new definition.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge>Step 2</Badge>
                Add Widget to Product Template
              </CardTitle>
              <CardDescription>
                Add this code to your product template (product.liquid or product-template.liquid)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 relative">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{widgetCode}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(widgetCode, 'widget')}
                  data-testid="button-copy-widget"
                >
                  {copiedSection === 'widget' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Place this where you want the "View in Your Space" button to appear, 
                typically below the Add to Cart button.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge>Step 3</Badge>
                Set Artwork Images
              </CardTitle>
              <CardDescription>
                For each product, upload the low-res artwork to the wav_image metafield
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to the product in Shopify admin</li>
                <li>Scroll to <strong>Metafields</strong> section</li>
                <li>Find <strong>wav_image</strong> field</li>
                <li>Click to upload or select a low-resolution artwork image from Shopify Files</li>
                <li>Save the product</li>
              </ol>
              
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm">
                <strong>Tip:</strong> Upload low-res artwork images to Shopify Files first, then select them for the wav_image metafield. 
                Images should be 1000-2000px on the longest side for best AR performance.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Liquid Template</CardTitle>
              <CardDescription>
                Full implementation with variant change detection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 relative">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{liquidVariantCode}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(liquidVariantCode, 'liquid')}
                  data-testid="button-copy-liquid"
                >
                  {copiedSection === 'liquid' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Widget Configuration</CardTitle>
              <CardDescription>
                Customize the widget behavior with JavaScript
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <pre className="text-sm overflow-x-auto">{`<script>
  // Optional: Configure before loading widget
  window.EASTSIDE_CONFIG = {
    containerSelector: '.eastside-ar-container',
    buttonSelector: '.eastside-ar-button',
    autoInit: true,
    debug: false
  };
  window.EASTSIDE_AR_BASE_URL = '${baseUrl}';
</script>
<script src="${baseUrl}/shopify-ar-widget.js" defer></script>`}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Size &amp; Frame Mapping</CardTitle>
              <CardDescription>
                Custom mapping from Shopify variant names to AR dimensions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                The widget automatically maps common Shopify variant names to AR parameters. 
                You can customize these mappings:
              </p>
              
              <div className="bg-muted rounded-lg p-4">
                <pre className="text-sm overflow-x-auto">{`<script>
  // Custom size mapping (before loading widget)
  window.EASTSIDE_SIZE_MAP = {
    // A-series sizes
    'a4 - 8.27': 'A4',
    'a3 - 11.69': 'A3',
    'a2 - 16.54': 'A2',
    
    // Custom sizes
    'small': '20x30cm',
    'medium': '30x40cm',
    'large': '50x70cm',
    
    // Imperial
    '8x10': '8x10in',
    '11x14': '11x14in',
  };
  
  // Custom frame mapping
  window.EASTSIDE_FRAME_MAP = {
    'black frame': 'black',
    'white frame': 'white',
    'oak frame': 'oak',
    'natural frame': 'natural',
    'walnut': 'oak',
    'ebony': 'black',
  };
</script>
<script src="${baseUrl}/shopify-ar-widget.js" defer></script>`}</pre>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
                <strong>Built-in mappings:</strong> The widget includes default mappings for A-series sizes 
                (A0-A5), common metric (20x30cm to 70x100cm), and imperial sizes (8x10in to 24x36in). 
                Frame styles: black, white, oak, natural.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Variant Options</CardTitle>
              <CardDescription>
                How to set up product variants for size and frame
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                The widget reads size and frame from your product variant options:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><strong>Option 1 (Size):</strong> Format like "30x40cm", "A4 - 8.27", or "12x16in"</li>
                <li><strong>Option 2 (Frame):</strong> "Black Frame", "White Frame", "Oak", "Natural"</li>
              </ul>
              <div className="bg-muted rounded-lg p-4 text-sm">
                <strong>Example variant titles:</strong>
                <ul className="mt-2 space-y-1">
                  <li>A4 - 8.27 / Black Frame</li>
                  <li>A3 - 11.69 / Natural Frame</li>
                  <li>30x40cm / Oak</li>
                  <li>12x16in / White Frame</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
              <CardDescription>
                Direct API access for custom integrations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2">Generate AR Model</h4>
                <code className="bg-muted px-2 py-1 rounded text-sm block overflow-x-auto">
                  GET {baseUrl}/api/ar/generate
                </code>
                <div className="mt-3 space-y-2 text-sm">
                  <p><strong>Parameters:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><code>imageUrl</code> (required) - URL to the artwork image</li>
                    <li><code>size</code> - Print size, e.g., "30x40cm" (default: "30x40cm")</li>
                    <li><code>frame</code> - Frame style: "natural", "oak", "black", "white" (default: "natural")</li>
                    <li><code>frameWidth</code> - Frame width in mm (default: 20)</li>
                    <li><code>mount</code> - Mount border in mm (default: 0)</li>
                  </ul>
                  <p className="mt-2"><strong>Returns:</strong> GLB binary file (model/gltf-binary)</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">AR Viewer Page</h4>
                <code className="bg-muted px-2 py-1 rounded text-sm block overflow-x-auto">
                  GET {baseUrl}/ar/shopify
                </code>
                <div className="mt-3 space-y-2 text-sm">
                  <p><strong>Parameters:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><code>imageUrl</code> (required) - URL to the artwork image</li>
                    <li><code>size</code> - Print size</li>
                    <li><code>frame</code> - Frame style</li>
                    <li><code>title</code> - Product title for display</li>
                    <li><code>mount</code> - Mount border in mm</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>JavaScript API Example</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 relative">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{apiExample}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(apiExample, 'api')}
                  data-testid="button-copy-api"
                >
                  {copiedSection === 'api' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Widget JavaScript API</CardTitle>
              <CardDescription>
                Methods available on window.EastSideAR
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div>
                  <code className="font-semibold">EastSideAR.init()</code>
                  <p className="text-muted-foreground ml-2">Initialize or reinitialize the widget</p>
                </div>
                <div>
                  <code className="font-semibold">EastSideAR.openARViewer(config)</code>
                  <p className="text-muted-foreground ml-2">Open AR viewer with custom config</p>
                </div>
                <div>
                  <code className="font-semibold">EastSideAR.getProductConfig()</code>
                  <p className="text-muted-foreground ml-2">Get current product configuration from page</p>
                </div>
                <div>
                  <code className="font-semibold">EastSideAR.supportsAR()</code>
                  <p className="text-muted-foreground ml-2">Check if device supports AR</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button variant="outline" asChild data-testid="button-test-ar">
            <a href="/ar/shopify?imageUrl=https://picsum.photos/800/1000&size=30x40cm&frame=natural&title=Test%20Artwork" target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" />
              Test AR Viewer
            </a>
          </Button>
          <Button variant="outline" asChild data-testid="button-widget-script">
            <a href="/shopify-ar-widget.js" target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Widget Script
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
