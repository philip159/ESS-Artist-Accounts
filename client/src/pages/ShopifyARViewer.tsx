import { useEffect, useState, useRef } from "react";
import "@google/model-viewer";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          ar?: boolean;
          "ar-modes"?: string;
          "ar-scale"?: string;
          "ar-placement"?: string;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "shadow-intensity"?: string;
          "shadow-softness"?: string;
          exposure?: string;
          "environment-image"?: string;
          "camera-orbit"?: string;
          "min-camera-orbit"?: string;
          "max-camera-orbit"?: string;
          "field-of-view"?: string;
          poster?: string;
          loading?: "auto" | "lazy" | "eager";
          reveal?: "auto" | "interaction" | "manual";
        },
        HTMLElement
      >;
    }
  }
}

export default function ShopifyARViewer() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artworkTitle, setArtworkTitle] = useState("Artwork");
  const [autoARTriggered, setAutoARTriggered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const modelViewerRef = useRef<HTMLElement | null>(null);

  // Detect mobile device
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobile = /iphone|ipad|ipod|android/.test(userAgent);
    const ios = /iphone|ipad|ipod/.test(userAgent);
    setIsMobile(mobile);
    setIsIOS(ios);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const imageUrl = params.get("imageUrl");
    const size = params.get("size") || "30x40cm";
    const frame = params.get("frame") || "natural";
    const title = params.get("title");
    const mount = params.get("mount") || "0";
    const frameType = params.get("frameType") || "standard";

    if (title) {
      setArtworkTitle(decodeURIComponent(title));
    }

    if (!imageUrl) {
      setError("Missing artwork image URL");
      setIsLoading(false);
      return;
    }

    const arApiUrl = `/api/ar/generate?imageUrl=${encodeURIComponent(imageUrl)}&size=${encodeURIComponent(size)}&frame=${encodeURIComponent(frame)}&mount=${mount}&frameType=${frameType}`;
    setModelUrl(arApiUrl);
    setIsLoading(false);
  }, []);

  // Set up event listeners when model-viewer is mounted
  const handleModelViewerRef = (el: HTMLElement | null) => {
    if (!el) return;
    modelViewerRef.current = el;
    
    el.addEventListener("load", () => {
      setIsLoading(false);
      
      // Auto-trigger AR on mobile devices
      if (isMobile && !autoARTriggered) {
        setAutoARTriggered(true);
        // Small delay to ensure model-viewer is fully ready
        setTimeout(() => {
          (el as any).activateAR?.();
        }, 500);
      }
    });
    
    el.addEventListener("error", () => {
      setError("Failed to load 3D model");
      setIsLoading(false);
    });
    
    // Fallback timeout
    setTimeout(() => setIsLoading(false), 10000);
  };

  const activateAR = () => {
    const modelViewer = modelViewerRef.current as any;
    if (modelViewer?.activateAR) {
      modelViewer.activateAR();
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md text-center">
          <div className="text-red-500 text-4xl mb-4">⚠</div>
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-medium truncate">{artworkTitle}</h1>
        <button
          onClick={activateAR}
          className="bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
          data-testid="button-activate-ar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          View in Your Space
        </button>
      </header>

      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-gray-300 border-t-black rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading 3D preview...</p>
            </div>
          </div>
        )}

        {modelUrl && (
          <model-viewer
            ref={handleModelViewerRef as any}
            src={modelUrl}
            alt={`${artworkTitle} - Framed artwork preview`}
            ar
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="wall"
            camera-controls
            auto-rotate
            shadow-intensity="1"
            shadow-softness="0.8"
            exposure="1"
            camera-orbit="0deg 75deg 2.5m"
            min-camera-orbit="auto auto 0.5m"
            max-camera-orbit="auto auto 5m"
            field-of-view="30deg"
            loading="eager"
            style={{
              width: "100%",
              height: "100%",
              position: "absolute",
              inset: 0,
              backgroundColor: "#f3f4f6",
            }}
            data-testid="model-viewer-shopify"
          />
        )}
      </div>

      <footer className="bg-white border-t px-4 py-3 text-center text-sm text-gray-500">
        <p>Tap the button above to see this artwork on your wall</p>
      </footer>
    </div>
  );
}
