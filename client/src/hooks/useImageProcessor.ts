import { useRef, useCallback } from 'react';

interface ProcessImageResult {
  requestId: string;
  thumbnailUrl: string;
  analysis: {
    widthPx: number;
    heightPx: number;
    dpi: number;
    aspectRatio: string;
    ratioCategory: string;
    maxPrintSize: string;
    availableSizes: string[];
    ratio: number;
    effectiveDpi: number;
    warning?: string;
    isCMYK?: boolean; // Client-side CMYK detection from EXIF/TIFF metadata
    isDefinitelyRGB?: boolean; // True only when EXIF confirms RGB/sRGB - safe to skip server
  } | null;
}

export function useImageProcessor() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequestsRef = useRef<Map<string, {
    resolve: (result: ProcessImageResult) => void;
    reject: (error: Error) => void;
  }>>(new Map());

  // Initialize worker lazily
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/imageProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      // Global message handler that routes responses to correct promises
      workerRef.current.addEventListener('message', (e: MessageEvent<ProcessImageResult>) => {
        const { requestId } = e.data;
        const pending = pendingRequestsRef.current.get(requestId);
        
        if (pending) {
          pending.resolve(e.data);
          pendingRequestsRef.current.delete(requestId);
        }
      });
      
      workerRef.current.addEventListener('error', (error: ErrorEvent) => {
        // Reject all pending requests on worker error
        pendingRequestsRef.current.forEach(({ reject }) => {
          reject(new Error(error.message));
        });
        pendingRequestsRef.current.clear();
      });
    }
    return workerRef.current;
  }, []);

  const processImage = useCallback(
    (file: File, maxThumbnailWidth: number = 800): Promise<ProcessImageResult> => {
      return new Promise((resolve, reject) => {
        const worker = getWorker();
        const requestId = crypto.randomUUID();

        // Store promise handlers
        pendingRequestsRef.current.set(requestId, { resolve, reject });

        // Send request with unique ID
        worker.postMessage({ requestId, file, maxThumbnailWidth });
      });
    },
    [getWorker]
  );

  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  return { processImage, cleanup };
}
