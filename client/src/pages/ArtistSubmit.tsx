import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, CheckCircle2, AlertCircle, Sparkles, Info, AlertTriangle, RefreshCw, X, ThumbsUp, ThumbsDown, Plus, HelpCircle, ChevronDown, Copy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { extractArtworkTitle, formatArtworkDisplay, fixFilenameEncoding } from "@/lib/titleExtractor";
import { useImageProcessor } from "@/hooks/useImageProcessor";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import SignatureCanvas from "react-signature-canvas";
import type { FormSettings } from "@shared/schema";
import { PRINT_SIZES, ARTWORK_TAG_OPTIONS } from "@shared/schema";
import { ProgressStepper } from "@/components/ProgressStepper";
import { FramedMockup, preloadImageBitmap } from "@/components/FramedMockup";
import { SignatureModal } from "@/components/SignatureModal";
import { PrintSizesDropdown } from "@/components/PrintSizesDropdown";
import { FAQsDropdown } from "@/components/FAQsDropdown";
import { CertificateOfAuthenticityPreview } from "@/components/CertificateOfAuthenticityPreview";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// File validation constants
const MAX_FILE_SIZE_MB = 300;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['image/jpeg'];
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for large edition COA generation

// Storage key for progress recovery
const UPLOAD_PROGRESS_KEY = 'artflow_upload_progress';

// Common email domain typos to check for
const COMMON_EMAIL_TYPOS: Record<string, string> = {
  // TLD typos
  '.con': '.com',
  '.cpm': '.com',
  '.vom': '.com',
  '.cim': '.com',
  '.cm': '.com',
  '.coom': '.com',
  '.ckm': '.com',
  '.ocm': '.com',
  '.coim': '.com',
  '.xom': '.com',
  '.cok': '.com',
  '.comm': '.com',
  '.co.um': '.co.uk',
  '.co.yk': '.co.uk',
  '.co.ul': '.co.uk',
  '.ner': '.net',
  '.nte': '.net',
  '.neet': '.net',
  '.ogr': '.org',
  '.oeg': '.org',
  '.orgg': '.org',
  // Domain typos
  'gmial.': 'gmail.',
  'gmal.': 'gmail.',
  'gmaill.': 'gmail.',
  'gmil.': 'gmail.',
  'gnail.': 'gmail.',
  'gamil.': 'gmail.',
  'hotmal.': 'hotmail.',
  'hotmial.': 'hotmail.',
  'hotmil.': 'hotmail.',
  'hotmai.': 'hotmail.',
  'outlok.': 'outlook.',
  'outloo.': 'outlook.',
  'outlokk.': 'outlook.',
  'yahooo.': 'yahoo.',
  'yaho.': 'yahoo.',
  'yahho.': 'yahoo.',
  'iclould.': 'icloud.',
  'iclud.': 'icloud.',
  'icoud.': 'icloud.',
};

// Check for common email typos and return suggestion
function checkEmailTypos(email: string): string | null {
  const lowerEmail = email.toLowerCase();
  for (const [typo, correction] of Object.entries(COMMON_EMAIL_TYPOS)) {
    if (lowerEmail.includes(typo)) {
      const suggestion = lowerEmail.replace(typo, correction);
      return suggestion;
    }
  }
  return null;
}

// Form schemas for each step
const step1Schema = z.object({
  artistName: z.string().min(1, "Please enter your name"),
  artistEmail: z.string()
    .min(1, "Please enter your email")
    .email("Please enter a valid email")
    .refine((email) => {
      const suggestion = checkEmailTypos(email);
      return suggestion === null;
    }, (email) => {
      const suggestion = checkEmailTypos(email);
      return { message: `Did you mean "${suggestion}"? Please check for typos.` };
    }),
});

const step2Schema = z.object({
  comments: z.string().optional(),
  artworkStory: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

interface UploadedFile {
  id: string; // Stable unique identifier for this file
  file: File;
  title: string;
  preview: string;
  mockupUrl: string; // 800px thumbnail for fast canvas rendering (client-generated)
  serverThumbnailUrl?: string; // Color-accurate thumbnail from server (for CMYK images)
  isCMYK?: boolean; // Whether the image uses CMYK color space
  status: "pending" | "uploading" | "processing" | "success" | "error";
  errorMessage?: string;
  uploadProgress?: number; // Upload progress percentage (0-100)
  selectedSizes: string[]; // Sizes selected by artist
  sizeAssignments?: string[]; // Specific sizes this file should be used for (from filename notation)
  editionSize?: number; // Edition size for limited editions (20-150)
  editionSizeSplit?: Record<string, number>; // Per-size edition quantities for limited editions
  parentFileId?: string; // If set, this is an additional file linked to a parent artwork
  artworkStory?: string; // Story/description for this artwork (limited editions)
  styleTags: string[];
  colourTags: string[];
  moodTags: string[];
  themeTags: string[];
  analysis?: {
    widthPx: number;
    heightPx: number;
    effectiveDpi: number;
    aspectRatio: string;
    ratioCategory: string;
    maxPrintSize: string;
    availableSizes: string[];
    warning?: string;
  } | null;
}

// Calculate edition size split: larger sizes get smaller quantities, smaller sizes get larger quantities
function calculateEditionSizeSplit(totalEdition: number, selectedSizes: string[]): Record<string, number> {
  if (selectedSizes.length === 0) return {};
  if (selectedSizes.length === 1) return { [selectedSizes[0]]: totalEdition };
  
  // Get size areas for sorting (larger area = larger size = fewer prints)
  const sizesWithArea = selectedSizes.map(code => {
    const size = PRINT_SIZES.find(s => s.code === code);
    const area = size ? size.widthIn * size.heightIn : 0;
    return { code, area };
  }).sort((a, b) => b.area - a.area); // Sort largest first
  
  // Create weighted distribution: smallest size gets most prints
  // Use position-based weights: first (largest) = 1, second = 2, etc.
  const weights = sizesWithArea.map((_, index) => index + 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  // Distribute edition based on weights
  const split: Record<string, number> = {};
  let remaining = totalEdition;
  
  sizesWithArea.forEach((item, index) => {
    if (index === sizesWithArea.length - 1) {
      // Last item gets whatever remains (to ensure exact total)
      split[item.code] = remaining;
    } else {
      const quantity = Math.round((weights[index] / totalWeight) * totalEdition);
      split[item.code] = Math.max(1, quantity); // At least 1 per size
      remaining -= split[item.code];
    }
  });
  
  // Ensure we have at least 1 for each size and adjust if needed
  const minPerSize = 1;
  Object.keys(split).forEach(code => {
    if (split[code] < minPerSize) split[code] = minPerSize;
  });
  
  return split;
}

// Parse filename notation for size assignments
// Format: 'TITLE+SIZE&SIZE' e.g., 'FLOWER 4+A4&A3' → { title: 'FLOWER 4', sizeAssignments: ['A4', 'A3'] }
function parseFilenameForSizes(filename: string): { title: string; sizeAssignments: string[] } {
  // Fix encoding for Japanese/Unicode characters
  filename = fixFilenameEncoding(filename);
  // Remove file extension first
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // Check for + notation indicating size assignments
  const plusIndex = nameWithoutExt.lastIndexOf('+');
  if (plusIndex === -1) {
    return { title: nameWithoutExt, sizeAssignments: [] };
  }
  
  const title = nameWithoutExt.substring(0, plusIndex).trim();
  const sizePart = nameWithoutExt.substring(plusIndex + 1);
  
  // Parse sizes separated by & or ,
  const sizes = sizePart
    .split(/[&,]/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);
  
  // Validate that these look like size codes (A4, A3, A2, A1, A0, or similar)
  const validSizePattern = /^A[0-5]$/i;
  const validSizes = sizes.filter(s => validSizePattern.test(s));
  
  if (validSizes.length === 0) {
    // No valid sizes found, treat the whole thing as the title
    return { title: nameWithoutExt, sizeAssignments: [] };
  }
  
  return { title, sizeAssignments: validSizes };
}

type FormStep = 0 | 0.5 | 1 | 2 | 3; // 0: Edition Type, 0.5: Limited Edition Overview, 1: Name/Email, 2: Upload + Signature, 3: Thank You

// File validation helper
interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// Check if two aspect ratios match within tolerance (2% difference allowed)
function aspectRatiosMatch(width1: number, height1: number, width2: number, height2: number): boolean {
  const ratio1 = width1 / height1;
  const ratio2 = width2 / height2;
  const tolerance = 0.02; // 2% tolerance - strict matching for same artwork variants
  const difference = Math.abs(ratio1 - ratio2) / Math.max(ratio1, ratio2);
  return difference <= tolerance;
}

// Format aspect ratio for display (e.g., "4:5", "2:3")
function formatAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  // Common ratios
  if (Math.abs(ratio - 1) < 0.02) return "1:1 (square)";
  if (Math.abs(ratio - 0.8) < 0.02) return "4:5";
  if (Math.abs(ratio - 0.667) < 0.02) return "2:3";
  if (Math.abs(ratio - 0.75) < 0.02) return "3:4";
  if (Math.abs(ratio - 1.25) < 0.02) return "5:4";
  if (Math.abs(ratio - 1.5) < 0.02) return "3:2";
  if (Math.abs(ratio - 1.333) < 0.02) return "4:3";
  // Fallback to decimal
  return ratio > 1 ? `${ratio.toFixed(2)}:1` : `1:${(1/ratio).toFixed(2)}`;
}

// Get image dimensions from a File object
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function validateFile(file: File): FileValidationResult {
  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `Invalid file type "${file.type.split('/')[1] || 'unknown'}". Only JPG/JPEG files are allowed.` 
    };
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(0);
    return { 
      valid: false, 
      error: `File too large (${sizeMB}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.` 
    };
  }
  
  // Check if file is empty
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }
  
  return { valid: true };
}

// Error message helper for clearer descriptions
function getUploadErrorMessage(error: Error | string, statusCode?: number): string {
  const errorStr = typeof error === 'string' ? error : error.message;
  
  if (errorStr.includes('Network error') || errorStr.includes('Failed to fetch')) {
    return 'Connection lost. Please check your internet and try again.';
  }
  if (errorStr.includes('timeout') || errorStr.includes('Timeout')) {
    return 'Upload timed out. The file may be too large or connection too slow.';
  }
  if (errorStr.includes('Dropbox')) {
    return 'Storage service temporarily unavailable. Please try again later.';
  }
  if (statusCode === 413) {
    return 'File too large for server. Please reduce file size.';
  }
  if (statusCode === 503) {
    return 'Server temporarily unavailable. Please try again in a few minutes.';
  }
  if (statusCode && statusCode >= 500) {
    return 'Server error occurred. Our team has been notified.';
  }
  
  return errorStr || 'Upload failed. Please try again.';
}

// Interface for duplicate title detection
interface DuplicateTitleInfo {
  title: string;
  indices: number[];
  ratioCategories: string[];
  hasSameRatio: boolean; // True if all duplicates have the same ratio
  hasDifferentRatios: boolean; // True if duplicates have different ratios (merge case)
  hasSizeAssignments: boolean; // True if any file has size assignments (intentional duplicates)
  sizeAssignmentInfo: { index: number; sizes: string[] }[]; // Details of size assignments
}

// Helper function to detect duplicate titles
function detectDuplicateTitles(files: UploadedFile[]): DuplicateTitleInfo[] {
  const titleGroups: { [title: string]: { 
    indices: number[]; 
    ratioCategories: string[];
    sizeAssignments: { index: number; sizes: string[] }[];
  } } = {};
  
  files.forEach((file, index) => {
    // Skip child files (additional files linked to a parent) - they don't count as duplicates
    if (file.parentFileId) return;
    
    const normalizedTitle = file.title.toLowerCase().trim();
    if (!normalizedTitle) return;
    
    if (!titleGroups[normalizedTitle]) {
      titleGroups[normalizedTitle] = { indices: [], ratioCategories: [], sizeAssignments: [] };
    }
    titleGroups[normalizedTitle].indices.push(index);
    if (file.analysis?.ratioCategory) {
      titleGroups[normalizedTitle].ratioCategories.push(file.analysis.ratioCategory);
    }
    if (file.sizeAssignments && file.sizeAssignments.length > 0) {
      titleGroups[normalizedTitle].sizeAssignments.push({ index, sizes: file.sizeAssignments });
    }
  });
  
  // Only return groups with 2+ files
  return Object.entries(titleGroups)
    .filter(([_, group]) => group.indices.length >= 2)
    .map(([title, group]) => {
      const uniqueRatios = Array.from(new Set(group.ratioCategories));
      const hasSizeAssignments = group.sizeAssignments.length > 0;
      return {
        title: files[group.indices[0]].title, // Use original casing from first file
        indices: group.indices,
        ratioCategories: group.ratioCategories,
        hasSameRatio: uniqueRatios.length === 1 && group.ratioCategories.length === group.indices.length,
        hasDifferentRatios: uniqueRatios.length > 1,
        hasSizeAssignments,
        sizeAssignmentInfo: group.sizeAssignments,
      };
    });
}

// Interface for saved progress state
interface SavedProgress {
  currentStep: FormStep;
  editionType: "open" | "limited";
  editionSize?: number;
  step1Data: Step1Data;
  comments?: string;
  artworkStory?: string;
  signature?: string;
  timestamp: number;
}

export default function ArtistSubmit() {
  const [currentStep, setCurrentStep] = useState<FormStep>(0);
  const [editionType, setEditionType] = useState<"open" | "limited">("open");
  const [editionSize, setEditionSize] = useState<number>(50);
  const [step1Data, setStep1Data] = useState<Step1Data>({ artistName: "", artistEmail: "" });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  // Defer the selected index for expensive preview updates so selection ring appears immediately
  const deferredSelectedIndex = useDeferredValue(selectedFileIndex);
  const [signature, setSignature] = useState<string>("");
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string>("");
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localTitles, setLocalTitles] = useState<{[fileId: string]: string}>({});
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const [savedProgress, setSavedProgress] = useState<SavedProgress | null>(null);
  const [ratioMismatchDialog, setRatioMismatchDialog] = useState<{ open: boolean; files: string[] }>({ open: false, files: [] });
  const [showSingleUploadDialog, setShowSingleUploadDialog] = useState(false);
  const [showTagLimitDialog, setShowTagLimitDialog] = useState(false);
  const MAX_TAGS_PER_CATEGORY = 3;
  const signatureRef = useRef<SignatureCanvas>(null);
  const signatureFileInputRef = useRef<HTMLInputElement>(null);
  const titleUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Form tracking state for submission tracking
  const [formSubmissionId, setFormSubmissionId] = useState<number | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { toast } = useToast();
  const { processImage, cleanup } = useImageProcessor();

  // Memoize signature file URL to prevent memory leaks from repeated createObjectURL calls
  const signatureFileUrl = useMemo(() => {
    if (signatureFile) {
      return URL.createObjectURL(signatureFile);
    }
    return undefined;
  }, [signatureFile]);
  
  // Cleanup signature file URL when it changes
  useEffect(() => {
    return () => {
      if (signatureFileUrl) {
        URL.revokeObjectURL(signatureFileUrl);
      }
    };
  }, [signatureFileUrl]);

  // Detect duplicate titles among uploaded files
  const duplicateTitles = useMemo(() => detectDuplicateTitles(files), [files]);

  // Get only parent files (no additional files) for preview and card display
  const parentFiles = useMemo(() => files.filter(f => !f.parentFileId), [files]);
  
  // Get the currently selected parent file for preview (ensure we never show child files)
  // Uses deferredSelectedIndex so the heavy preview update is deferred while selection ring is instant
  const selectedPreviewFile = useMemo(() => {
    // First try to get the file at deferredSelectedIndex
    const fileAtIndex = files[deferredSelectedIndex];
    if (fileAtIndex && !fileAtIndex.parentFileId) {
      return fileAtIndex;
    }
    // If it's a child file or doesn't exist, find its parent or fall back to first parent
    if (fileAtIndex?.parentFileId) {
      const parent = files.find(f => f.id === fileAtIndex.parentFileId);
      if (parent) return parent;
    }
    // Fall back to first parent file
    return parentFiles[0] || null;
  }, [files, deferredSelectedIndex, parentFiles]);

  // Pre-cache ALL artwork images as ImageBitmaps once they have thumbnails
  // This runs in the background so all images are ready when user starts clicking
  useEffect(() => {
    if (parentFiles.length === 0) return;
    
    // Stagger preloading to avoid blocking
    let delay = 0;
    parentFiles.forEach((file, idx) => {
      const urls = [
        file.serverThumbnailUrl,
        file.mockupUrl,
        file.preview
      ].filter(Boolean) as string[];
      
      urls.forEach(url => {
        // Stagger with increasing delays to avoid overwhelming the browser
        setTimeout(() => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => preloadImageBitmap(url), { timeout: 5000 });
          } else {
            preloadImageBitmap(url);
          }
        }, delay);
        delay += 50; // 50ms between each preload
      });
    });
  }, [parentFiles]);

  // Check for saved progress on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(UPLOAD_PROGRESS_KEY);
      if (saved) {
        const progress: SavedProgress = JSON.parse(saved);
        // Only show recovery if progress was saved within the last hour
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        if (progress.timestamp > oneHourAgo && progress.currentStep > 0) {
          setSavedProgress(progress);
          setShowRecoveryBanner(true);
        } else {
          // Clear old progress
          localStorage.removeItem(UPLOAD_PROGRESS_KEY);
        }
      }
    } catch (e) {
      console.error('Error loading saved progress:', e);
    }
  }, []);

  // Clear saved progress on successful completion
  const clearSavedProgress = useCallback(() => {
    localStorage.removeItem(UPLOAD_PROGRESS_KEY);
    setShowRecoveryBanner(false);
    setSavedProgress(null);
  }, []);

  // Fetch form settings
  const { data: settings } = useQuery<FormSettings>({
    queryKey: ["/api/form-settings"],
  });

  const copy = settings?.copy;
  const typography = settings?.typography;
  const isNonExclusive = settings?.nonExclusiveArtists?.some(
    (name) => name.toLowerCase().trim() === step1Data.artistName.toLowerCase().trim()
  ) ?? false;

  // Load Google Fonts when typography settings change
  useEffect(() => {
    const loadGoogleFont = (fontName: string) => {
      const fontId = `google-font-${fontName.replace(/\s+/g, '-')}`;
      if (document.getElementById(fontId)) return;
      
      const link = document.createElement('link');
      link.id = fontId;
      link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    };

    if (typography?.headingFont) {
      loadGoogleFont(typography.headingFont);
    }
    if (typography?.bodyFont) {
      loadGoogleFont(typography.bodyFont);
    }
  }, [typography?.headingFont, typography?.bodyFont]);

  // Should signature step be shown?
  const shouldShowSignature = !isNonExclusive;

  // Step 1 form
  const form1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: step1Data,
  });

  // Step 2 form
  const form2 = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: { comments: "" },
  });

  // Restore saved progress (must be after form declarations)
  const restoreProgress = useCallback(() => {
    if (savedProgress) {
      setCurrentStep(savedProgress.currentStep > 2 ? 2 : savedProgress.currentStep);
      setEditionType(savedProgress.editionType);
      if (savedProgress.editionSize) {
        setEditionSize(savedProgress.editionSize);
      }
      setStep1Data(savedProgress.step1Data);
      if (savedProgress.signature) {
        setSignature(savedProgress.signature);
      }
      form1.reset(savedProgress.step1Data);
      if (savedProgress.comments || savedProgress.artworkStory) {
        form2.reset({
          comments: savedProgress.comments || "",
          artworkStory: savedProgress.artworkStory || "",
        });
      }
      setShowRecoveryBanner(false);
      toast({
        title: "Progress restored",
        description: "Your form data has been recovered. You'll need to re-upload your files.",
      });
    }
  }, [savedProgress, form1, form2, toast]);

  // Dismiss recovery banner
  const dismissRecovery = useCallback(() => {
    setShowRecoveryBanner(false);
    clearSavedProgress();
  }, [clearSavedProgress]);

  // Save progress to localStorage when form state changes
  // Watch both form values for live updates
  const form1Values = form1.watch();
  const form2Values = form2.watch();
  
  useEffect(() => {
    // Combine committed step1Data with any live form1 edits
    const currentStep1Data: Step1Data = {
      artistName: form1Values.artistName || step1Data.artistName,
      artistEmail: form1Values.artistEmail || step1Data.artistEmail,
    };
    
    // Only save if we have some meaningful data
    if (currentStep > 0 || currentStep1Data.artistName || currentStep1Data.artistEmail) {
      const progress: SavedProgress = {
        currentStep,
        editionType,
        editionSize: editionType === "limited" ? editionSize : undefined,
        step1Data: currentStep1Data,
        comments: form2Values.comments,
        artworkStory: form2Values.artworkStory,
        signature,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(UPLOAD_PROGRESS_KEY, JSON.stringify(progress));
      } catch (e) {
        console.error('Error saving progress:', e);
      }
    }
  }, [currentStep, editionType, editionSize, step1Data, signature, form1Values.artistName, form1Values.artistEmail, form2Values.comments, form2Values.artworkStory]);

  // Form tracking autosave - creates/updates submission in Forms tracking system
  useEffect(() => {
    // Only track when there's meaningful data (artist name or email)
    const artistName = form1Values.artistName || step1Data.artistName;
    const artistEmail = form1Values.artistEmail || step1Data.artistEmail;
    const hasData = artistName || artistEmail;
    if (!hasData) return;

    // Debounce autosave
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Map current step to numeric value for tracking
        const stepNumber = currentStep === 0.5 ? 1 : Math.ceil(currentStep) + 1;
        const totalSteps = 3; // Edition Type, Name/Email, Upload + Signature
        
        const fieldData: Record<string, string> = {
          artistName: artistName || "",
          artistEmail: artistEmail || "",
          editionType: editionType,
          editionSize: editionType === "limited" ? String(editionSize) : "",
          comments: form2Values.comments || "",
          artworkStory: form2Values.artworkStory || "",
          fileCount: String(files.length),
          currentStep: String(stepNumber),
        };

        if (formSubmissionId) {
          // Update existing submission
          await apiRequest("PATCH", `/api/forms/submissions/${formSubmissionId}`, {
            data: fieldData,
            actorEmail: artistEmail || undefined,
            actorName: artistName || undefined,
            currentStep: stepNumber,
            totalSteps,
            status: currentStep === 3 ? "completed" : "in_progress",
          });
        } else {
          // Create new submission
          const response = await apiRequest("POST", "/api/forms/artist-upload/submissions", {
            data: fieldData,
            actorEmail: artistEmail || undefined,
            actorName: artistName || undefined,
            currentStep: stepNumber,
            totalSteps,
            status: "in_progress",
          });
          const result = await response.json();
          if (result.id) {
            setFormSubmissionId(result.id);
          }
        }
      } catch (error) {
        // Silent fail - form tracking shouldn't block user
        console.error("Form tracking autosave error:", error);
      }
    }, 2000); // 2 second debounce

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [form1Values.artistName, form1Values.artistEmail, step1Data.artistName, step1Data.artistEmail, 
      editionType, editionSize, form2Values.comments, form2Values.artworkStory, 
      currentStep, files.length, formSubmissionId]);

  // Cleanup autosave timeout on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    // Validate all files upfront
    const validatedFiles: { file: File; validation: FileValidationResult }[] = selectedFiles.map(file => ({
      file,
      validation: validateFile(file)
    }));
    
    // Show toast for any rejected files
    const rejectedFiles = validatedFiles.filter(f => !f.validation.valid);
    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(f => `${f.file.name}: ${f.validation.error}`);
      toast({
        title: `${rejectedFiles.length} file${rejectedFiles.length > 1 ? 's' : ''} rejected`,
        description: errors.length <= 3 
          ? errors.join('\n') 
          : `${errors.slice(0, 2).join('\n')}\n...and ${errors.length - 2} more`,
        variant: "destructive",
      });
    }
    
    // Only process valid files
    const validFiles = validatedFiles.filter(f => f.validation.valid).map(f => f.file);
    if (validFiles.length === 0) return;

    const initialFiles: UploadedFile[] = validFiles.map((file) => {
      const preview = URL.createObjectURL(file);
      
      // First parse filename for size assignments (e.g., 'FLOWER 4+A4&A3')
      const { title: parsedTitle, sizeAssignments } = parseFilenameForSizes(file.name);
      
      // Then clean up the title (remove artist name, etc.)
      const baseTitle = sizeAssignments.length > 0 
        ? extractArtworkTitle(parsedTitle + '.jpg', step1Data.artistName) // Add fake extension for the extractor
        : extractArtworkTitle(file.name, step1Data.artistName);

      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        title: baseTitle,
        preview,
        mockupUrl: '',
        status: "pending" as const,
        selectedSizes: [],
        sizeAssignments: sizeAssignments.length > 0 ? sizeAssignments : undefined,
        editionSize: 50,
        styleTags: [],
        colourTags: [],
        moodTags: [],
        themeTags: [],
        analysis: undefined,
      };
    });

    setFiles((prev) => [...prev, ...initialFiles]);

    // Process each file in Web Worker (background thread - no UI blocking!)
    validFiles.forEach(async (file, index) => {
      const fileObj = initialFiles[index];
      
      try {
        // Single worker call generates thumbnail + analyzes image (batched operation)
        const result = await processImage(file, 800);

        // Single state update with client-side thumbnail (for card display)
        // Don't set serverThumbnailUrl yet - wait for server to confirm RGB/CMYK
        const availableSizes = result.analysis?.availableSizes || [];
        const editionSizeSplit = calculateEditionSizeSplit(50, availableSizes);
        setFiles((prev) =>
          prev.map((f) => 
            f.file === fileObj.file 
              ? { 
                  ...f,
                  mockupUrl: result.thumbnailUrl,
                  analysis: result.analysis,
                  selectedSizes: availableSizes,
                  editionSizeSplit
                } 
              : f
          )
        );
        
        // Only skip server if EXIF positively confirms RGB/sRGB
        // This is conservative: if uncertain, we still go to server
        const isConfidentRGB = result.analysis?.isDefinitelyRGB === true;
        
        if (isConfidentRGB) {
          // EXIF confirms sRGB/AdobeRGB - safe to use client thumbnail
          console.log(`[Upload] RGB confirmed via EXIF metadata - skipping server for ${file.name}`);
          setFiles((prev) =>
            prev.map((f) => 
              f.file === fileObj.file 
                ? { 
                    ...f,
                    serverThumbnailUrl: result.thumbnailUrl,
                    isCMYK: false
                  } 
                : f
            )
          );
        } else {
          const reason = result.analysis?.isCMYK ? 'CMYK detected' : 'uncertain color space';
          const fileSizeMB = file.size / 1024 / 1024;
          
          if (fileSizeMB > 80) {
            console.log(`[Upload] ${reason} but file too large (${fileSizeMB.toFixed(0)}MB) - using client thumbnail for ${file.name}`);
            setFiles((prev) =>
              prev.map((f) => 
                f.file === fileObj.file 
                  ? { 
                      ...f,
                      serverThumbnailUrl: result.thumbnailUrl,
                      isCMYK: result.analysis?.isCMYK || false
                    } 
                  : f
              )
            );
          } else {
            console.log(`[Upload] ${reason} - fetching server thumbnail for ${file.name}`);
            try {
              const formData = new FormData();
              formData.append('file', file);
              
              const serverResponse = await fetch('/api/artworks/analyze?includeThumbnail=true', {
                method: 'POST',
                body: formData
              });
              
              if (serverResponse.ok) {
                const serverAnalysis = await serverResponse.json();
                
                if (serverAnalysis.thumbnailBase64) {
                  console.log(`[Upload] Server thumbnail received for CMYK file ${file.name}`);
                  setFiles((prev) =>
                    prev.map((f) => 
                      f.file === fileObj.file 
                        ? { 
                            ...f,
                            serverThumbnailUrl: serverAnalysis.thumbnailBase64,
                            isCMYK: true
                          } 
                        : f
                    )
                  );
                }
              }
            } catch (serverError) {
              console.warn('[Upload] Server analysis failed, using client thumbnail:', serverError);
              setFiles((prev) =>
                prev.map((f) => 
                  f.file === fileObj.file 
                    ? { ...f, serverThumbnailUrl: result.thumbnailUrl } 
                    : f
                )
              );
            }
          }
        }
      } catch (error) {
        console.error("Error processing file:", error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to analyse image';
        setFiles((prev) =>
          prev.map((f) => 
            f.file === fileObj.file 
              ? { ...f, analysis: null, errorMessage } 
              : f
          )
        );
      }
    });
  };
  
  // Clean up worker and timeouts on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (titleUpdateTimeoutRef.current) {
        clearTimeout(titleUpdateTimeoutRef.current);
      }
    };
  }, [cleanup]);

  const toggleSize = (fileIndex: number, size: string) => {
    setFiles((prev) =>
      prev.map((file, i) => {
        if (i !== fileIndex) return file;
        
        const newSelectedSizes = file.selectedSizes.includes(size)
          ? file.selectedSizes.filter(s => s !== size)
          : [...file.selectedSizes, size];
        
        // Recalculate edition split when sizes change
        const editionSizeSplit = calculateEditionSizeSplit(file.editionSize || 50, newSelectedSizes);
        
        return { ...file, selectedSizes: newSelectedSizes, editionSizeSplit };
      })
    );
  };

  const updateEditionSize = (fileIndex: number, newSize: number) => {
    // Allow any value during typing - clamping happens on blur
    setFiles((prev) =>
      prev.map((file, i) => {
        if (i !== fileIndex) return file;
        // Recalculate edition split when edition size changes
        const editionSizeSplit = calculateEditionSizeSplit(newSize, file.selectedSizes);
        return { ...file, editionSize: newSize, editionSizeSplit };
      })
    );
  };

  const clampEditionSize = (fileIndex: number) => {
    // Clamp to valid range: 20-200 on blur
    setFiles((prev) =>
      prev.map((file, i) => {
        if (i !== fileIndex) return file;
        const currentSize = file.editionSize || 50;
        const clampedSize = Math.min(200, Math.max(20, currentSize));
        if (clampedSize !== currentSize) {
          const editionSizeSplit = calculateEditionSizeSplit(clampedSize, file.selectedSizes);
          return { ...file, editionSize: clampedSize, editionSizeSplit };
        }
        return file;
      })
    );
  };

  const updateArtworkStory = (fileIndex: number, story: string) => {
    setFiles((prev) =>
      prev.map((file, i) => {
        if (i !== fileIndex) return file;
        return { ...file, artworkStory: story };
      })
    );
  };

  const removeFile = (index: number) => {
    const fileToRemove = files[index];
    // Clean up object URLs to prevent memory leaks
    if (fileToRemove.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    if (fileToRemove.mockupUrl) {
      URL.revokeObjectURL(fileToRemove.mockupUrl);
    }
    // Clean up local title state
    setLocalTitles((prev) => {
      const newTitles = { ...prev };
      delete newTitles[fileToRemove.id];
      return newTitles;
    });
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle additional files for an existing artwork (size-specific files)
  const handleAdditionalFiles = async (parentIndex: number, newFiles: File[]) => {
    const parentFile = files[parentIndex];
    if (!parentFile) return;

    // Parent must have analysis to compare aspect ratios
    if (!parentFile.analysis) {
      toast({
        title: "Please wait",
        description: "The parent artwork is still being analysed. Try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    // Store parent dimensions for aspect ratio comparison
    const parentWidth = parentFile.analysis.widthPx;
    const parentHeight = parentFile.analysis.heightPx;

    // Validate files
    const validatedFiles: { file: File; validation: FileValidationResult }[] = newFiles.map(file => ({
      file,
      validation: validateFile(file)
    }));

    const rejectedFiles = validatedFiles.filter(f => !f.validation.valid);
    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(f => `${f.file.name}: ${f.validation.error}`);
      toast({
        title: `${rejectedFiles.length} file${rejectedFiles.length > 1 ? 's' : ''} rejected`,
        description: errors.length <= 3 
          ? errors.join('\n') 
          : `${errors.slice(0, 2).join('\n')}\n...and ${errors.length - 2} more`,
        variant: "destructive",
      });
    }

    let validFiles = validatedFiles.filter(f => f.validation.valid).map(f => f.file);
    if (validFiles.length === 0) return;

    // Check aspect ratios of all valid files
    const mismatchedFiles: string[] = [];
    const matchedFiles: File[] = [];
    
    for (const file of validFiles) {
      try {
        const dimensions = await getImageDimensions(file);
        
        // Check if aspect ratios match within tolerance
        if (!aspectRatiosMatch(parentWidth, parentHeight, dimensions.width, dimensions.height)) {
          const parentRatio = formatAspectRatio(parentWidth, parentHeight);
          const fileRatio = formatAspectRatio(dimensions.width, dimensions.height);
          mismatchedFiles.push(`${file.name} (${fileRatio} vs original ${parentRatio})`);
        } else {
          matchedFiles.push(file);
        }
      } catch (error) {
        console.error("Error getting dimensions:", error);
        // If we can't get dimensions, let it through and the server will handle it
        matchedFiles.push(file);
      }
    }

    // Show dialog for mismatched files
    if (mismatchedFiles.length > 0) {
      setRatioMismatchDialog({ open: true, files: mismatchedFiles });
    }

    // Only proceed with matched files
    validFiles = matchedFiles;
    if (validFiles.length === 0) return;

    // Create new file entries with the same title as the parent
    const additionalFiles: UploadedFile[] = validFiles.map((file) => {
      const preview = URL.createObjectURL(file);

      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        title: parentFile.title, // Inherit title from parent
        preview,
        mockupUrl: '',
        status: "pending" as const,
        selectedSizes: [],
        sizeAssignments: [], // Will be set after analysis
        editionSize: parentFile.editionSize || 50,
        parentFileId: parentFile.id, // Link to parent artwork
        styleTags: [],
        colourTags: [],
        moodTags: [],
        themeTags: [],
        analysis: undefined,
      };
    });

    // Insert new files right after the parent
    setFiles((prev) => {
      const newArr = [...prev];
      newArr.splice(parentIndex + 1, 0, ...additionalFiles);
      return newArr;
    });

    toast({
      title: `Additional files added for "${parentFile.title}".`,
    });

    // Process each file in Web Worker
    validFiles.forEach(async (file, index) => {
      const fileObj = additionalFiles[index];
      
      try {
        const result = await processImage(file, 800);

        const availableSizes = result.analysis?.availableSizes || [];
        const editionSizeSplit = calculateEditionSizeSplit(fileObj.editionSize || 50, availableSizes);
        setFiles((prev) =>
          prev.map((f) => 
            f.id === fileObj.id 
              ? { 
                  ...f,
                  mockupUrl: result.thumbnailUrl,
                  analysis: result.analysis,
                  selectedSizes: availableSizes,
                  editionSizeSplit
                } 
              : f
          )
        );
      } catch (error) {
        console.error("Error processing file:", error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to analyse image';
        setFiles((prev) =>
          prev.map((f) => 
            f.id === fileObj.id 
              ? { ...f, analysis: null, errorMessage } 
              : f
          )
        );
      }
    });
  };

  const updateTitle = (index: number, newTitle: string) => {
    const fileId = files[index]?.id;
    if (!fileId) return;
    
    // Immediately update local state for responsive typing
    setLocalTitles(prev => ({ ...prev, [fileId]: newTitle }));
    
    // Clear existing timeout
    if (titleUpdateTimeoutRef.current) {
      clearTimeout(titleUpdateTimeoutRef.current);
    }
    
    // Debounce update to files state (which triggers mockup re-render)
    // Use stable ID comparison to prevent corruption if files are removed/reordered
    titleUpdateTimeoutRef.current = setTimeout(() => {
      setFiles((prev) =>
        prev.map((file) => (file.id === fileId ? { ...file, title: newTitle } : file))
      );
    }, 300); // 300ms debounce
  };

  const handleTitleBlur = (index: number) => {
    const fileId = files[index]?.id;
    if (!fileId) return;
    
    // Clear any pending timeout to immediately apply the current value
    if (titleUpdateTimeoutRef.current) {
      clearTimeout(titleUpdateTimeoutRef.current);
      titleUpdateTimeoutRef.current = null;
    }
    
    const currentFile = files.find(f => f.id === fileId);
    if (!currentFile) return;
    
    let currentTitle = localTitles[fileId] ?? currentFile.title;
    
    // Only strip artist name from user input, preserve everything else they typed
    // Don't use extractArtworkTitle here - that's for parsing filenames, not user edits
    if (step1Data.artistName && step1Data.artistName.trim()) {
      const artistName = step1Data.artistName.trim();
      const nameParts = artistName.split(/\s+/);
      const fullNameRegex = new RegExp(
        `\\b${nameParts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`,
        'gi'
      );
      currentTitle = currentTitle.replace(fullNameRegex, '').replace(/\s+/g, ' ').trim();
    }

    // Immediately update files state using stable ID comparison
    setFiles((prev) =>
      prev.map((file) => (file.id === fileId ? { ...file, title: currentTitle } : file))
    );
    
    // Update local state as well
    setLocalTitles(prev => ({ ...prev, [fileId]: currentTitle }));
  };

  const handleSignatureFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, etc.)",
        variant: "destructive",
      });
      return;
    }

    setSignatureFile(file);
    setSignaturePreview(URL.createObjectURL(file));
  };

  const handleRemoveSignatureFile = () => {
    setSignatureFile(null);
    setSignaturePreview("");
    if (signatureFileInputRef.current) {
      signatureFileInputRef.current.value = "";
    }
  };

  // Update titles when artist name changes - only strip artist name, don't re-apply title case
  useEffect(() => {
    if (step1Data.artistName && files.length > 0) {
      const artistName = step1Data.artistName.trim();
      setFiles((prev) =>
        prev.map((file) => {
          let title = file.title;
          // Only strip the artist name from the title, preserve user's capitalization
          if (artistName) {
            const nameParts = artistName.split(/\s+/);
            // Remove exact full name match (case insensitive)
            const fullNameRegex = new RegExp(
              `\\b${nameParts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`,
              'gi'
            );
            title = title.replace(fullNameRegex, '').trim();
            // Clean up extra whitespace
            title = title.replace(/\s+/g, ' ').trim();
          }
          return { ...file, title };
        })
      );
    }
  }, [step1Data.artistName]);

  const uploadMutation = useMutation({
    mutationFn: async (data: {
      artistName: string;
      artistEmail: string;
      comments: string;
      artworkStory?: string;
      editionType: "open" | "limited";
      editionSize?: number;
      signature?: string;
      signatureFile?: File | null;
      fileData: UploadedFile;
      index: number;
      uploadBatchId: string;
    }) => {
      const { artistName, artistEmail, comments, artworkStory, editionType, editionSize, signature, signatureFile, fileData, index, uploadBatchId } = data;

      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, status: "uploading", uploadProgress: 0, errorMessage: undefined } : f))
      );

      const formData = new FormData();
      formData.append("file", fileData.file);
      formData.append("artistName", artistName);
      formData.append("artistEmail", artistEmail);
      formData.append("title", fileData.title);
      formData.append("selectedSizes", JSON.stringify(fileData.selectedSizes));
      formData.append("uploadBatchId", uploadBatchId);
      formData.append("editionType", editionType);
      if (editionType === "limited" && editionSize) {
        formData.append("editionSize", String(editionSize));
      }
      if (fileData.parentFileId) {
        formData.append("isAdditionalFile", "true");
      }
      if (comments) formData.append("comments", comments);
      if (artworkStory) formData.append("artworkStory", artworkStory);
      if (signature) formData.append("signature", signature);
      if (signatureFile) formData.append("signatureFile", signatureFile);
      if (fileData.styleTags.length > 0) formData.append("styleTags", JSON.stringify(fileData.styleTags));
      if (fileData.colourTags.length > 0) formData.append("colourTags", JSON.stringify(fileData.colourTags));
      if (fileData.moodTags.length > 0) formData.append("moodTags", JSON.stringify(fileData.moodTags));
      if (fileData.themeTags.length > 0) formData.append("themeTags", JSON.stringify(fileData.themeTags));

      // Use XMLHttpRequest for upload progress tracking with timeout
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastProgressTime = Date.now();
        let progressCheckInterval: ReturnType<typeof setInterval>;

        // Set timeout for the entire request
        xhr.timeout = UPLOAD_TIMEOUT_MS;

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          lastProgressTime = Date.now();
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setFiles((prev) =>
              prev.map((f, i) => (i === index ? { ...f, uploadProgress: percentComplete } : f))
            );
          }
        });

        // When upload completes, switch to processing state (server generates COAs)
        xhr.upload.addEventListener('loadend', () => {
          if (editionType === "limited") {
            setFiles((prev) =>
              prev.map((f, i) => (i === index ? { ...f, status: "processing" } : f))
            );
          }
        });

        // Check for stalled uploads (no progress for 30 seconds)
        progressCheckInterval = setInterval(() => {
          if (Date.now() - lastProgressTime > 30000) {
            clearInterval(progressCheckInterval);
            xhr.abort();
            reject(new Error('Upload stalled - no progress for 30 seconds'));
          }
        }, 5000);

        xhr.addEventListener('load', () => {
          clearInterval(progressCheckInterval);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (error) {
              reject(new Error('Invalid server response'));
            }
          } else {
            // Try to parse error message from server
            let errorMessage = 'Upload failed';
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              errorMessage = errorResponse.message || errorResponse.error || errorMessage;
            } catch {
              // Use status-based message
              errorMessage = getUploadErrorMessage('Upload failed', xhr.status);
            }
            const error = new Error(errorMessage);
            (error as any).statusCode = xhr.status;
            reject(error);
          }
        });

        xhr.addEventListener('error', () => {
          clearInterval(progressCheckInterval);
          reject(new Error('Connection lost. Please check your internet and try again.'));
        });

        xhr.addEventListener('abort', () => {
          clearInterval(progressCheckInterval);
          reject(new Error('Upload cancelled'));
        });

        xhr.addEventListener('timeout', () => {
          clearInterval(progressCheckInterval);
          reject(new Error('Upload timed out. The file may be too large or your connection too slow.'));
        });

        xhr.open('POST', '/api/artworks');
        xhr.send(formData);
      });
    },
    onSuccess: (_, variables) => {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === variables.index ? { ...f, status: "success", errorMessage: undefined } : f
        )
      );
    },
    onError: (error: Error, variables) => {
      const statusCode = (error as any).statusCode;
      const friendlyMessage = getUploadErrorMessage(error, statusCode);
      setFiles((prev) =>
        prev.map((f, i) =>
          i === variables.index
            ? { ...f, status: "error", errorMessage: friendlyMessage }
            : f
        )
      );
    },
  });

  // Retry a single failed upload
  const retryUpload = useCallback(async (index: number) => {
    const fileData = files[index];
    if (!fileData || fileData.status !== 'error') return;

    const comments = form2.getValues("comments") || "";
    const artworkStory = form2.getValues("artworkStory") || "";
    const uploadBatchId = crypto.randomUUID();

    try {
      await uploadMutation.mutateAsync({
        artistName: step1Data.artistName,
        artistEmail: step1Data.artistEmail,
        comments,
        artworkStory: editionType === "limited" ? artworkStory : undefined,
        editionType,
        editionSize: editionType === "limited" ? fileData.editionSize : undefined,
        signature: shouldShowSignature && editionType === "open" ? signature : undefined,
        signatureFile: editionType === "limited" ? signatureFile : null,
        fileData,
        index,
        uploadBatchId,
      });
      
      toast({
        title: "Upload successful",
        description: `"${fileData.title}" has been uploaded.`,
      });
    } catch (error) {
      console.error(`Retry failed for file ${index}:`, error);
    }
  }, [files, step1Data, editionType, signature, signatureFile, form2, uploadMutation, shouldShowSignature, toast]);

  // Check if all files have been analyzed
  const allFilesAnalyzed = files.length > 0 && files.every((file) => file.analysis !== undefined);
  
  // Only show error for invalid files after all analyses complete
  // Check selectedSizes (what artist chose), not availableSizes (what was calculated)
  const hasInvalidFiles = allFilesAnalyzed && files.some(
    (file) => file.selectedSizes.length < 2
  );

  const onStep1Submit = (data: Step1Data) => {
    setStep1Data(data);
    setCurrentStep(2);
  };

  const onStep2Next = () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please upload at least one artwork image",
        variant: "destructive",
      });
      return;
    }
    
    // Check for files with insufficient resolution
    const insufficientFiles = files.filter(
      (file) => !file.analysis || file.analysis.availableSizes.length < 2
    );
    
    if (insufficientFiles.length > 0) {
      toast({
        title: "Image resolution too low",
        description: `${insufficientFiles.length} file(s) do not meet the minimum requirement of 2 print sizes. Please upload higher resolution images or remove these files.`,
        variant: "destructive",
      });
      return;
    }
    
    // Limited Edition validations
    if (editionType === "limited") {
      // Check each file has an artwork story with at least 200 characters
      const filesWithoutStory = files.filter(f => !f.artworkStory || f.artworkStory.length < 200);
      
      if (filesWithoutStory.length > 0) {
        toast({
          title: "Artwork story required",
          description: `Please provide at least 200 characters for each artwork's story. ${filesWithoutStory.length} artwork(s) need more detail.`,
          variant: "destructive",
        });
        return;
      }
      
      if (!signatureFile) {
        toast({
          title: "Signature file required",
          description: "Please upload your signature for Limited Edition submissions",
          variant: "destructive",
        });
        return;
      }
    }
    
    if (shouldShowSignature && !signature && editionType === "open") {
      toast({
        title: "Signature required",
        description: "Please add your signature before continuing",
        variant: "destructive",
      });
      return;
    }
    
    // Show reminder dialog if only one piece is being uploaded
    // Use parentFiles to count actual artworks (not size-specific additional files)
    const parentFileCount = files.filter(f => !f.parentFileId).length;
    if (parentFileCount === 1) {
      setShowSingleUploadDialog(true);
      return;
    }
    
    handleFinalSubmit();
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    const comments = form2.getValues("comments") || "";
    let successCount = 0;
    
    // Generate a single batch ID for all files uploaded together
    const uploadBatchId = crypto.randomUUID();

    try {
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadMutation.mutateAsync({
            artistName: step1Data.artistName,
            artistEmail: step1Data.artistEmail,
            comments,
            artworkStory: editionType === "limited" ? files[i].artworkStory : undefined,
            editionType,
            editionSize: editionType === "limited" ? files[i].editionSize : undefined,
            signature: shouldShowSignature && editionType === "open" ? signature : undefined,
            signatureFile: editionType === "limited" ? signatureFile : null,
            fileData: files[i],
            index: i,
            uploadBatchId,
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to upload file ${i}:`, error);
        }
      }

      if (successCount > 0) {
        // Complete the batch - this will send emails and auto-group artworks
        try {
          const response = await fetch("/api/artworks/batch-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadBatchId }),
          });
          
          if (!response.ok) {
            console.error("Batch completion failed, but uploads succeeded");
            toast({
              title: "Artworks uploaded",
              description: "Your artworks were uploaded successfully, but we couldn't send confirmation emails.",
              variant: "default",
            });
          }
        } catch (error) {
          console.error("Error completing batch:", error);
        }
        
        // Clear saved progress on successful completion
        clearSavedProgress();
        setCurrentStep(3);
      } else {
        toast({
          title: "Upload failed",
          description: "All uploads failed. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const clearSignature = () => {
    signatureRef.current?.clear();
    setSignature("");
  };

  const saveSignature = () => {
    if (signatureRef.current) {
      const dataUrl = signatureRef.current.toDataURL();
      setSignature(dataUrl);
      toast({
        title: "Signature saved",
        description: "You can now continue to submit your artworks",
      });
    }
  };

  const progressSteps = [
    {
      label: "Edition Type",
      status: currentStep > 0 ? "completed" as const : "current" as const,
    },
    {
      label: "Your Details",
      status: currentStep > 1 ? "completed" as const : currentStep === 1 ? "current" as const : "upcoming" as const,
    },
    {
      label: "Upload Artwork",
      status: currentStep > 2 ? "completed" as const : currentStep === 2 ? "current" as const : "upcoming" as const,
    },
    {
      label: "Finished",
      status: currentStep === 3 ? "current" as const : "upcoming" as const,
    },
  ];

  // Typography styles to apply throughout the form
  const headingFontStyle = typography?.headingFont ? { fontFamily: typography.headingFont } : {};
  const bodyFontStyle = typography?.bodyFont ? { fontFamily: typography.bodyFont } : {};

  return (
    <div 
      className="min-h-screen bg-background overflow-x-clip relative"
      style={bodyFontStyle}
    >
      {/* Beta Badge */}
      <div className="absolute top-4 right-4 z-10">
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-semibold">
          Beta
        </Badge>
      </div>
      <div className="pt-16 pb-12 flex items-center justify-center">
        <img
          src={new URL("@assets/East Side Studio2_1line_Black_24_1763330142482.png", import.meta.url).href}
          alt="East Side Studio"
          className="h-8"
        />
      </div>
      <ProgressStepper steps={progressSteps} />
      <div className={`mx-auto px-4 sm:px-6 pb-20 ${currentStep === 2 ? 'max-w-7xl' : 'max-w-3xl'}`}>
        {/* Step 0: Edition Type Selection */}
        {currentStep === 0 && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-bold font-display" style={headingFontStyle}>
                What kind of artwork are you uploading today?
              </h1>
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => {
                  setEditionType("open");
                  setCurrentStep(1);
                }}
                className={`flex items-center gap-4 p-6 rounded-xl border-2 transition-all hover-elevate ${
                  editionType === "open"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
                data-testid="button-select-open-edition"
              >
                <div className="relative flex-shrink-0 w-6 h-6 rounded-full border-2 border-primary">
                  {editionType === "open" && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-[16px]" style={headingFontStyle}>Open Edition Artwork</h3>
                </div>
              </button>

              <button
                onClick={() => {
                  setEditionType("limited");
                  setCurrentStep(0.5);
                }}
                className={`flex items-center gap-4 p-6 rounded-xl border-2 transition-all hover-elevate ${
                  editionType === "limited"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
                data-testid="button-select-limited-edition"
              >
                <div className="relative flex-shrink-0 w-6 h-6 rounded-full border-2 border-primary">
                  {editionType === "limited" && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-[16px]" style={headingFontStyle}>Limited Edition Artwork</h3>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 0.5: Limited Edition Overview */}
        {currentStep === 0.5 && editionType === "limited" && (
          <div className="space-y-8">
            <div className="text-center space-y-6">
              <h1 className="text-xl font-bold font-display" style={headingFontStyle}>
                Limited Edition Overview
              </h1>
              {settings?.limitedEditionOverview ? (
                <div className="text-muted-foreground text-[14px] leading-relaxed max-w-2xl mx-auto whitespace-pre-line">
                  {settings.limitedEditionOverview}
                </div>
              ) : (
                <p className="text-muted-foreground text-[14px] max-w-2xl mx-auto">
                  Limited editions are one of the best ways to grow your collection with East Side Studio London. Each edition is capped at a fixed number of prints. Once it sells out, it's gone for good – no reprints.
                </p>
              )}
            </div>

            <div className="flex gap-4 justify-center">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setCurrentStep(0)}
                className="h-14 rounded-full text-sm font-semibold"
                data-testid="button-back-limited-overview"
              >
                Back
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => setCurrentStep(1)}
                className="h-14 rounded-full text-sm font-semibold px-12"
                data-testid="button-continue-limited-overview"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Name & Email */}
        {currentStep === 1 && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-bold font-display" style={headingFontStyle}>
                {copy?.step1Title || "Let's start with your details"}
              </h1>
              {copy?.step1Subtitle && (
                <p className="text-muted-foreground">{copy.step1Subtitle}</p>
              )}
            </div>

            <Form {...form1}>
              <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-6">
                <FormField
                  control={form1.control}
                  name="artistName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[14px]">
                        {copy?.nameLabel || "Your Name"} <span className="text-destructive">*</span>
                      </FormLabel>
                      {copy?.nameHelpText && (
                        <p className="text-sm text-muted-foreground">{copy.nameHelpText}</p>
                      )}
                      <FormControl>
                        <Input
                          className="h-12 rounded-full"
                          {...field}
                          data-testid="input-artist-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form1.control}
                  name="artistEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[14px]">
                        {copy?.emailLabel || "Email"} <span className="text-destructive">*</span>
                      </FormLabel>
                      {copy?.emailHelpText && (
                        <p className="text-sm text-muted-foreground">{copy.emailHelpText}</p>
                      )}
                      <FormControl>
                        <Input
                          type="email"
                          className="h-12 rounded-full"
                          {...field}
                          data-testid="input-artist-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setCurrentStep(editionType === "limited" ? 0.5 : 0)}
                    className="h-14 rounded-full text-sm font-semibold"
                    data-testid="button-back-step1"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="flex-1 h-14 rounded-full text-sm font-semibold"
                    data-testid="button-next-step1"
                  >
                    Next
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {/* Step 2: File Upload */}
        {currentStep === 2 && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-bold font-display" style={headingFontStyle}>
                {copy?.step2Title || "Upload Artwork"}
              </h1>
              <p className="text-muted-foreground text-[14px]">{copy?.step2Subtitle || "Before uploading your artworks, please review the available print sizes and FAQs. We recommend uploading artworks at 300DPI, but we will accept a minimum of 200DPI."}</p>
            </div>

            <div className={`grid grid-cols-1 gap-8 ${files.length > 0 ? 'lg:grid-cols-[3fr_2fr]' : ''}`}>
              {/* Left Column: Upload Form */}
              <div className={files.length === 0 ? 'max-w-2xl mx-auto w-full' : ''}>
                <Form {...form2}>
                  <form className="space-y-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-bold block text-[14px]">
                      {copy?.uploadLabel || "Upload Files"} <span className="text-destructive">*</span>
                    </label>
                    <p className="text-sm text-muted-foreground">{copy?.uploadHelpText || "You can upload multiple artwork in one go. Drag and drop or click below to select your files."}</p>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,image/jpeg"
                        multiple
                        onChange={handleFileSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        data-testid="input-file-upload"
                      />
                      <div className="h-12 rounded-full border border-input bg-background px-4 flex items-center justify-center text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors">
                        Choose files
                      </div>
                    </div>
                  </div>

                  <PrintSizesDropdown copy={copy} />

                  <FAQsDropdown 
                    faqs={editionType === "limited" 
                      ? (settings?.printSizeFAQs?.limitedEdition || [])
                      : (settings?.printSizeFAQs?.openEdition || [])
                    }
                    lastUpdated={settings?.faqsLastUpdated 
                      ? new Date(settings.faqsLastUpdated).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.')
                      : undefined
                    }
                  />

                  {files.length > 0 && (
                    <div className="space-y-3">
                      {/* Explanatory text above uploaded files */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-blue-800 dark:text-blue-200">
                            <p className="font-medium mb-1">Before you submit:</p>
                            <ul className="list-disc pl-4 space-y-0.5 text-xs">
                              <li><strong>Check your titles</strong> – we've extracted them from your filenames, but please make sure they look correct.</li>
                              <li><strong>Size-specific files:</strong> Use the <Plus className="w-3 h-3 inline mx-0.5" /> button to add alternative files optimised for specific print sizes. Name each file with the corresponding size E.g. 'Full of Wonder_A4+A3+A2'.</li>
                              {editionType === "limited" && (
                                <li><strong>Edition size:</strong> Check the edition size, we will automatically divide the edition based on the sizes you select. We suggest selecting an edition size between 50 - 150.</li>
                              )}
                              {editionType !== "limited" && (
                                <li><strong>Different ratios:</strong> If you have the same artwork in different ratios (e.g., 3:4 & 4:5), upload each ratio as a separate artwork with the same title - they will be merged into one listing.</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Duplicate title warnings */}
                      {duplicateTitles.map((duplicate) => {
                        // Determine the type of duplicate:
                        // 1. Has size assignments = intentional, size-specific files (green/info)
                        // 2. Same ratio, no size assignments = likely error (red)
                        // 3. Different ratios = will merge into one listing (amber)
                        const isIntentionalSizeSpecific = duplicate.hasSizeAssignments;
                        const isLikelyError = duplicate.hasSameRatio && !duplicate.hasSizeAssignments;
                        
                        let bgClass = 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
                        let iconClass = 'text-amber-600 dark:text-amber-400';
                        let textClass = 'text-amber-800 dark:text-amber-200';
                        
                        if (isIntentionalSizeSpecific) {
                          bgClass = 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
                          iconClass = 'text-green-600 dark:text-green-400';
                          textClass = 'text-green-800 dark:text-green-200';
                        } else if (isLikelyError) {
                          bgClass = 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
                          iconClass = 'text-red-600 dark:text-red-400';
                          textClass = 'text-red-800 dark:text-red-200';
                        }
                        
                        return (
                          <div 
                            key={duplicate.title}
                            className={`p-3 rounded-lg border ${bgClass}`}
                            data-testid={`alert-duplicate-title-${duplicate.title.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            <div className="flex items-start gap-2">
                              {isIntentionalSizeSpecific ? (
                                <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
                              ) : (
                                <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
                              )}
                              <div className={`text-sm ${textClass}`}>
                                {isIntentionalSizeSpecific ? (
                                  <>
                                    <p className="font-medium">Size-specific files: "{duplicate.title}"</p>
                                    <p className="text-xs mt-1">
                                      {duplicate.indices.length} files will be used for different print sizes. 
                                      {duplicate.sizeAssignmentInfo.map((info, i) => (
                                        <span key={i} className="block mt-0.5">
                                          File {info.index + 1}: {info.sizes.join(', ')}
                                        </span>
                                      ))}
                                    </p>
                                  </>
                                ) : isLikelyError ? (
                                  <>
                                    <p className="font-medium">Possible duplicate: "{duplicate.title}"</p>
                                    <p className="text-xs mt-1">
                                      {duplicate.indices.length} artworks have the same title and aspect ratio. 
                                      If this is intentional (e.g., different files for different sizes), use the <Plus className="w-3 h-3 inline mx-0.5" /> Add files button 
                                      on the original artwork to add size-specific files. Otherwise, please change one of the titles.
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-medium">Artworks will be merged: "{duplicate.title}"</p>
                                    <p className="text-xs mt-1">
                                      {duplicate.indices.length} artworks share this title with different aspect ratios ({Array.from(new Set(duplicate.ratioCategories)).join(', ')}). 
                                      These will be combined into a single product listing with multiple size options.
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {files.filter(f => !f.parentFileId).map((fileData, index) => {
                        // Count additional files for this parent
                        const additionalFilesCount = files.filter(f => f.parentFileId === fileData.id).length;
                        // Get the actual index in the full files array for functions that need it
                        const actualIndex = files.findIndex(f => f.id === fileData.id);
                        
                        return (
                          <Card 
                            key={fileData.id} 
                            className={`p-3 sm:p-4 cursor-pointer overflow-hidden ${
                              selectedFileIndex === actualIndex 
                                ? 'ring-2 ring-primary border-primary' 
                                : 'hover-elevate'
                            }`}
                            onClick={() => setSelectedFileIndex(actualIndex)}
                            data-testid={`card-artwork-${actualIndex}`}
                          >
                            {/* Mobile: Action buttons centered */}
                            <div className="flex flex-col items-center gap-2 sm:hidden mb-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(actualIndex);
                                }}
                                disabled={fileData.status === "uploading"}
                                data-testid={`button-remove-mobile-${actualIndex}`}
                                className="h-8 px-2 text-xs"
                              >
                                <X className="w-4 h-4 mr-1" />
                                Remove
                              </Button>
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const input = document.createElement('input');
                                      input.type = 'file';
                                      input.accept = '.jpg,.jpeg,image/jpeg';
                                      input.multiple = true;
                                      input.onchange = (event) => {
                                        const target = event.target as HTMLInputElement;
                                        if (target.files) {
                                          handleAdditionalFiles(actualIndex, Array.from(target.files));
                                        }
                                      };
                                      input.click();
                                    }}
                                    disabled={fileData.status === "uploading"}
                                    data-testid={`button-add-files-mobile-${actualIndex}`}
                                    className="h-8 w-8"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-6 w-6 text-muted-foreground"
                                        data-testid={`button-help-add-files-mobile-${actualIndex}`}
                                      >
                                        <HelpCircle className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs">
                                      <p className="text-sm">
                                        <strong>Add size-specific files</strong><br />
                                        {settings?.additionalFilesHelperText || "Upload alternative versions of this artwork optimised for specific print sizes. This gives you more control over borders and details at different sizes."}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  Add files{additionalFilesCount > 0 && ` (${additionalFilesCount})`}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                              <img
                                src={fileData.preview}
                                alt={fileData.title}
                                className="w-full sm:w-24 h-32 sm:h-24 object-cover rounded-md"
                              />
                              <div className="flex-1 space-y-2">
                                <div>
                                  <Input
                                    value={localTitles[fileData.id] ?? fileData.title}
                                    onChange={(e) => updateTitle(actualIndex, e.target.value)}
                                    onBlur={() => handleTitleBlur(actualIndex)}
                                    placeholder={copy?.titleLabel || "Artwork title"}
                                    disabled={fileData.status !== "pending"}
                                    data-testid={`input-title-${actualIndex}`}
                                  />
                                  {fileData.sizeAssignments && fileData.sizeAssignments.length > 0 && (
                                    <div className="mt-1.5">
                                      <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
                                        For sizes: {fileData.sizeAssignments.join(', ')}
                                      </Badge>
                                    </div>
                                  )}

                                  {fileData.analysis === undefined && (
                                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                                      Analysing image...
                                    </div>
                                  )}

                                  {fileData.analysis === null && (
                                    <div className="mt-2">
                                      <div className="flex items-start gap-2 p-2 bg-red-500/10 rounded-md border border-red-500/30">
                                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-red-700 dark:text-red-300">
                                          <p className="font-medium">Analysis failed</p>
                                          <p className="text-xs mt-0.5">
                                            Unable to analyse this image. Please try a different file.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {fileData.analysis && fileData.analysis !== null && (
                                    <div className="mt-2 space-y-2">
                                      <div className="flex items-start gap-2 p-2 bg-blue-500/5 rounded-md border border-blue-500/20">
                                        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm space-y-1 flex-1">
                                          <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline" className="text-xs">
                                              {fileData.analysis.widthPx} × {fileData.analysis.heightPx}px
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                              {fileData.analysis.aspectRatio}
                                            </Badge>
                                            {fileData.analysis.effectiveDpi > 0 && (
                                              <Badge variant="outline" className="text-xs">
                                                {fileData.analysis.effectiveDpi} DPI at max size
                                              </Badge>
                                            )}
                                          </div>
                                          <p className="text-xs font-medium">
                                            Max print size: {fileData.analysis.maxPrintSize}
                                          </p>
                                          {fileData.analysis.availableSizes.length > 0 ? (
                                            <div>
                                              <p className="text-xs text-muted-foreground mb-2">
                                                Select print sizes ({fileData.selectedSizes.length}/{fileData.analysis.availableSizes.length} selected):
                                              </p>
                                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {fileData.analysis.availableSizes.map((size) => {
                                                  const isSelected = fileData.selectedSizes.includes(size);
                                                  const wouldBeLastTwo = fileData.selectedSizes.length === 2 && isSelected;
                                                  
                                                  return (
                                                    <div key={size} className="flex items-center gap-2">
                                                      <Checkbox
                                                        id={`size-${actualIndex}-${size}`}
                                                        checked={isSelected}
                                                        disabled={wouldBeLastTwo}
                                                        onCheckedChange={() => toggleSize(actualIndex, size)}
                                                        data-testid={`checkbox-size-${actualIndex}-${size}`}
                                                      />
                                                      <label
                                                        htmlFor={`size-${actualIndex}-${size}`}
                                                        className={`text-xs font-medium cursor-pointer ${wouldBeLastTwo ? 'text-muted-foreground' : ''}`}
                                                      >
                                                        {size}
                                                      </label>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                              {fileData.selectedSizes.length < 2 && (
                                                <p className="text-xs text-destructive mt-1">
                                                  At least 2 sizes must be selected
                                                </p>
                                              )}

                                              {/* Edition Size - Per Artwork for Limited Editions */}
                                              {editionType === "limited" && (
                                                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                                                  <div className="flex items-center gap-2">
                                                    <label className="text-xs font-medium">
                                                      Total edition:
                                                    </label>
                                                    <Input
                                                      type="number"
                                                      min={20}
                                                      max={200}
                                                      value={fileData.editionSize || 50}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const value = parseInt(e.target.value, 10);
                                                        if (!isNaN(value)) {
                                                          updateEditionSize(actualIndex, value);
                                                        }
                                                      }}
                                                      onBlur={(e) => {
                                                        e.stopPropagation();
                                                        clampEditionSize(actualIndex);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="w-20 h-8 text-center text-sm"
                                                      disabled={fileData.status !== "pending"}
                                                      data-testid={`input-edition-size-${actualIndex}`}
                                                    />
                                                    <span className="text-xs text-muted-foreground">prints</span>
                                                  </div>
                                                  {/* Edition Split per Size */}
                                                  {fileData.editionSizeSplit && Object.keys(fileData.editionSizeSplit).length > 1 && (
                                                    <div className="pl-2 space-y-1">
                                                      <p className="text-xs text-muted-foreground">Split by size:</p>
                                                      <div className="flex flex-wrap gap-2">
                                                        {fileData.selectedSizes
                                                          .map(size => {
                                                            const sizeInfo = PRINT_SIZES.find(s => s.code === size);
                                                            return { code: size, area: sizeInfo ? sizeInfo.widthIn * sizeInfo.heightIn : 0 };
                                                          })
                                                          .sort((a, b) => a.area - b.area) // Sort smallest first for display
                                                          .map(({ code }) => (
                                                            <Badge 
                                                              key={code} 
                                                              variant="outline" 
                                                              className="text-xs cursor-default no-default-hover-elevate no-default-active-elevate"
                                                              data-testid={`badge-edition-split-${actualIndex}-${code}`}
                                                            >
                                                              {code}: {fileData.editionSizeSplit?.[code] || 0}
                                                            </Badge>
                                                          ))
                                                        }
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {/* Artwork Tags */}
                                              {!fileData.parentFileId && (
                                                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                                                  <p className="text-xs font-medium">Help people find your work by adding relevant tags:</p>
                                                  <div className="grid grid-cols-2 gap-2">
                                                  {([
                                                    { key: "styleTags" as const, label: "Style", options: ARTWORK_TAG_OPTIONS.style },
                                                    { key: "colourTags" as const, label: "Colour", options: ARTWORK_TAG_OPTIONS.colour },
                                                    { key: "moodTags" as const, label: "Mood", options: ARTWORK_TAG_OPTIONS.mood },
                                                    { key: "themeTags" as const, label: "Themes", options: ARTWORK_TAG_OPTIONS.themes },
                                                  ]).map(({ key, label, options }) => (
                                                    <div key={key} className="flex items-center gap-1">
                                                      <Popover>
                                                        <PopoverTrigger asChild>
                                                          <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full justify-between text-xs"
                                                            onClick={(e) => e.stopPropagation()}
                                                            data-testid={`button-tag-${key}-${actualIndex}`}
                                                          >
                                                            <span className="truncate">
                                                              {fileData[key].length > 0
                                                                ? `${label} (${fileData[key].length})`
                                                                : label}
                                                            </span>
                                                            <ChevronDown className="w-3 h-3 ml-1 shrink-0 opacity-50" />
                                                          </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-56 p-2 max-h-60 overflow-y-auto" align="start" onClick={(e) => e.stopPropagation()}>
                                                          <div className="space-y-1">
                                                            {options.map((tag) => {
                                                              const isSelected = fileData[key].includes(tag);
                                                              return (
                                                                <label
                                                                  key={tag}
                                                                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer text-xs"
                                                                  data-testid={`label-tag-${key}-${actualIndex}-${tag.replace(/\s+/g, "-").toLowerCase()}`}
                                                                >
                                                                  <Checkbox
                                                                    checked={isSelected}
                                                                    onCheckedChange={() => {
                                                                      if (!isSelected && fileData[key].length >= MAX_TAGS_PER_CATEGORY) {
                                                                        setShowTagLimitDialog(true);
                                                                        return;
                                                                      }
                                                                      setFiles((prev) =>
                                                                        prev.map((f, i) => {
                                                                          if (i !== actualIndex) return f;
                                                                          const current = f[key];
                                                                          const updated = isSelected
                                                                            ? current.filter((t) => t !== tag)
                                                                            : [...current, tag];
                                                                          return { ...f, [key]: updated };
                                                                        })
                                                                      );
                                                                    }}
                                                                  />
                                                                  {tag}
                                                                </label>
                                                              );
                                                            })}
                                                          </div>
                                                        </PopoverContent>
                                                      </Popover>
                                                      {fileData[key].length > 0 && files.filter(f => !f.parentFileId).length > 1 && (
                                                        <Button
                                                          type="button"
                                                          size="icon"
                                                          variant="ghost"
                                                          onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (fileData[key].length > MAX_TAGS_PER_CATEGORY) {
                                                              setShowTagLimitDialog(true);
                                                              return;
                                                            }
                                                            setFiles((prev) =>
                                                              prev.map((f) => {
                                                                if (f.parentFileId) return f;
                                                                return { ...f, [key]: [...fileData[key]].slice(0, MAX_TAGS_PER_CATEGORY) };
                                                              })
                                                            );
                                                            toast({
                                                              title: `${label} tags applied`,
                                                              description: `${label} tags copied to all artworks`,
                                                            });
                                                          }}
                                                          data-testid={`button-copy-${key}-${actualIndex}`}
                                                        >
                                                          <Copy className="w-3 h-3" />
                                                        </Button>
                                                      )}
                                                    </div>
                                                  ))}
                                                  </div>
                                                  {(fileData.styleTags.length > 0 || fileData.colourTags.length > 0 || fileData.moodTags.length > 0 || fileData.themeTags.length > 0) && (
                                                    <div className="space-y-1 mt-1">
                                                      <div className="flex flex-wrap gap-1">
                                                        {(["styleTags", "colourTags", "moodTags", "themeTags"] as const).flatMap((tagKey) =>
                                                          fileData[tagKey].map((tag) => (
                                                            <Badge key={`${tagKey}-${tag}`} variant="secondary" className="text-xs pr-1 flex items-center gap-1" data-testid={`text-tag-summary-${actualIndex}-${tag.replace(/\s+/g, "-").toLowerCase()}`}>
                                                              {tag}
                                                              <button
                                                                type="button"
                                                                className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
                                                                onClick={(e) => {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                  setFiles((prev) =>
                                                                    prev.map((f, i) => {
                                                                      if (i !== actualIndex) return f;
                                                                      return { ...f, [tagKey]: f[tagKey].filter((t) => t !== tag) };
                                                                    })
                                                                  );
                                                                }}
                                                                data-testid={`button-remove-tag-${actualIndex}-${tag.replace(/\s+/g, "-").toLowerCase()}`}
                                                              >
                                                                <X className="w-3 h-3" />
                                                              </button>
                                                            </Badge>
                                                          ))
                                                        )}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          ) : fileData.analysis.ratioCategory && fileData.analysis.ratioCategory === "custom" ? (
                                            <div className="text-xs text-red-600 dark:text-red-400 font-medium">
                                              <p>Incompatible aspect ratio</p>
                                              <p className="text-xs font-normal mt-1 text-red-500 dark:text-red-300">
                                                This artwork cannot be printed. Please upload artwork with a standard ratio: Square (1:1), A Ratio, 2:3, 3:4, 4:5, or 5:8.
                                              </p>
                                            </div>
                                          ) : (
                                            <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                                              No print sizes available (resolution too low)
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      {fileData.analysis.warning && (
                                        <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-md border border-destructive/30">
                                          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                                          <p className="text-xs text-destructive">
                                            {fileData.analysis.warning}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm w-full">
                                  {fileData.status === "pending" && (
                                    <span className="text-muted-foreground">Ready to upload</span>
                                  )}
                                  {fileData.status === "uploading" && (
                                    <div className="flex flex-col gap-1 w-full">
                                      <div className="flex items-center justify-between">
                                        <span className="text-primary text-xs">Uploading...</span>
                                        <span className="text-primary text-xs font-medium">{fileData.uploadProgress ?? 0}%</span>
                                      </div>
                                      <Progress value={fileData.uploadProgress ?? 0} className="h-2" />
                                    </div>
                                  )}
                                  {fileData.status === "success" && (
                                    <span className="text-green-600 flex items-center gap-1">
                                      <CheckCircle2 className="w-4 h-4" />
                                      Uploaded
                                    </span>
                                  )}
                                  {fileData.status === "error" && (
                                    <div className="flex flex-col gap-2 w-full">
                                      <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-md border border-destructive/30">
                                        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                          <p className="text-xs text-destructive font-medium">Upload failed</p>
                                          <p className="text-xs text-destructive/80 mt-0.5">
                                            {fileData.errorMessage || "An error occurred during upload"}
                                          </p>
                                        </div>
                                      </div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          retryUpload(actualIndex);
                                        }}
                                        className="w-full"
                                        data-testid={`button-retry-${actualIndex}`}
                                      >
                                        <RefreshCw className="w-3 h-3 mr-1" />
                                        Retry Upload
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Desktop: Action buttons column */}
                              <div className="hidden sm:flex flex-col items-center gap-2 self-start">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFile(actualIndex);
                                  }}
                                  disabled={fileData.status === "uploading"}
                                  data-testid={`button-remove-${actualIndex}`}
                                >
                                  Remove
                                </Button>
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.jpg,.jpeg,image/jpeg';
                                        input.multiple = true;
                                        input.onchange = (event) => {
                                          const target = event.target as HTMLInputElement;
                                          if (target.files) {
                                            handleAdditionalFiles(actualIndex, Array.from(target.files));
                                          }
                                        };
                                        input.click();
                                      }}
                                      disabled={fileData.status === "uploading"}
                                      data-testid={`button-add-files-${actualIndex}`}
                                      className="h-8 w-8"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </Button>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={(e) => e.stopPropagation()}
                                          className="h-6 w-6 text-muted-foreground"
                                          data-testid={`button-help-add-files-${actualIndex}`}
                                        >
                                          <HelpCircle className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-xs">
                                        <p className="text-sm">
                                          <strong>Add size-specific files</strong><br />
                                          {settings?.additionalFilesHelperText || "Upload alternative versions of this artwork optimised for specific print sizes. This gives you more control over borders and details at different sizes."}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <span className="text-xs text-muted-foreground">Add files (optional){additionalFilesCount > 0 && ` (${additionalFilesCount})`}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Artwork Story - Limited Edition Only */}
                            {editionType === "limited" && (
                              <div className="mt-4 pt-4 border-t space-y-2">
                                <label className="font-bold text-[14px]">
                                  Artwork Story <span className="text-destructive">*</span>
                                </label>
                                <p className="text-sm text-muted-foreground">
                                  Share the inspiration, creative process, or meaning behind your artwork (minimum 200 characters)
                                </p>
                                <Textarea
                                  className="resize-none rounded-xl min-h-24"
                                  rows={4}
                                  placeholder="Tell us about what inspired this piece, your creative process, or the story you're trying to convey through your art..."
                                  value={fileData.artworkStory || ""}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    updateArtworkStory(actualIndex, e.target.value);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={fileData.status !== "pending"}
                                  data-testid={`input-artwork-story-${actualIndex}`}
                                />
                                <div className="text-xs text-muted-foreground">
                                  {fileData.artworkStory?.length || 0} / 200 characters minimum
                                </div>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
                  </form>
                </Form>
              </div>
              
              {/* Right Column: Framed Mockup Preview - Hidden until files are uploaded */}
              {parentFiles.length > 0 && selectedPreviewFile && (
                <div className="relative">
                  <div className="sticky top-4 h-fit">
                    {selectedPreviewFile.analysis && 
                     selectedPreviewFile.analysis.availableSizes.length > 0 && 
                     selectedPreviewFile.selectedSizes.length > 0 && (
                    <>
                      {/* Only show preview when ICC-matched serverThumbnailUrl is ready */}
                      {selectedPreviewFile.serverThumbnailUrl ? (
                        <>
                          <FramedMockup
                            imageUrl={selectedPreviewFile.serverThumbnailUrl}
                            fallbackUrl={selectedPreviewFile.mockupUrl || selectedPreviewFile.preview}
                            title={selectedPreviewFile.title || "Untitled"}
                            artistName={step1Data.artistName}
                            availableSizes={selectedPreviewFile.selectedSizes.map(code => {
                              const size = PRINT_SIZES.find(s => s.code === code);
                              if (!size) return code;
                              if (size.code.startsWith('A')) {
                                return `${size.code} - ${size.widthIn}" x ${size.heightIn}"`;
                              }
                              return `${size.widthIn}" x ${size.heightIn}"`;
                            })}
                            widthPx={selectedPreviewFile.analysis.widthPx}
                            heightPx={selectedPreviewFile.analysis.heightPx}
                            dpi={selectedPreviewFile.analysis.effectiveDpi}
                            hideFrameOptions={editionType === "limited"}
                            hideAdminControls={true}
                            editionType={editionType}
                          />
                          
                          {/* Certificate of Authenticity Preview - Limited Edition Only */}
                          {editionType === "limited" && (
                            <CertificateOfAuthenticityPreview
                              artworkTitle={selectedPreviewFile.title || "Untitled"}
                              artistName={step1Data.artistName}
                              editionSize={selectedPreviewFile.editionSize || 50}
                              signatureSrc={signatureFileUrl}
                              artworkPreview={selectedPreviewFile.serverThumbnailUrl}
                            />
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 space-y-4">
                          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Preparing Colour-Accurate Preview</p>
                        </div>
                      )}
                    </>
                  )}
                  </div>
                </div>
              )}
            </div>

            {/* Centered content below upload section */}
            <div className="max-w-2xl mx-auto">
              <Form {...form2}>
                <form className="space-y-8">
                  {/* Limited Edition Information */}
                  {editionType === "limited" && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
                    <h3 className="font-bold text-[14px] text-blue-900 dark:text-blue-100" style={headingFontStyle}>Limited Edition Submission Requirements</h3>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc pl-5">
                      <li>Artworks must be digital works only (no physical paintings or sketches).</li>
                      <li>Provide a detailed story about the inspiration behind your artwork (minimum 200 characters).</li>
                      <li>Upload a high-quality image of your signature for authentication, this will be used on your COAs.</li>
                      <li>A Verisart certificate of authenticity will be generated for each print. You will receive an invitation to be verified by Verisart, prior to your artworks going live.</li>
                    </ul>
                  </div>
                )}

                {/* Artist Signature Upload - Limited Edition Only */}
                {editionType === "limited" && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-bold text-[14px] block mb-2">
                        Artist Signature <span className="text-destructive">*</span>
                      </label>
                      <p className="text-sm text-muted-foreground mb-4">
                        Upload a high-quality image of your signature for authentication. This will be used to verify the authenticity of your Limited Edition artworks.
                      </p>
                    </div>

                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSignatureFile(file);
                            toast({
                              title: "Signature file selected",
                              description: file.name,
                            });
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        data-testid="input-signature-file"
                      />
                      <div className="flex items-center justify-center h-12 px-4 border border-input rounded-full bg-background hover:bg-accent/50 transition-colors cursor-pointer">
                        <span className="text-sm text-muted-foreground">Upload Signature</span>
                      </div>
                    </div>

                    {signatureFile && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        Signature file uploaded: {signatureFile.name}
                      </div>
                    )}

                    <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-xs text-muted-foreground">
                      <p className="font-semibold">Legal Declaration:</p>
                      <p>By uploading your signature, you confirm that:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>You are the original creator of this artwork</li>
                        <li>You grant East Side Studio London exclusive rights to reproduce and sell this artwork as Limited Edition prints</li>
                        <li>This artwork is digital and has not been previously published as a Limited Edition elsewhere</li>
                        <li>You authorize the use of your signature for Verisart certificate of authenticity generation</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Signature - Open Edition Only */}
                {shouldShowSignature && editionType === "open" && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-bold text-[14px] block mb-2">
                        {copy?.step3Title || "Confirmation"} <span className="text-destructive">*</span>
                      </label>
                      <p className="text-sm text-muted-foreground mb-4">
                        {copy?.signatureStatement || "I confirm these artworks are exclusive to East Side Studio London for sale as fine art prints."}
                      </p>
                    </div>

                    {signature ? (
                      <div className="space-y-3">
                        <div className="border-2 border-input rounded-lg p-4 bg-white">
                          <img
                            src={signature}
                            alt="Your signature"
                            className="max-h-24 mx-auto object-contain"
                            data-testid="img-signature-preview"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            Signature added
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSignatureModalOpen(true)}
                            data-testid="button-change-signature"
                          >
                            Change
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSignatureModalOpen(true)}
                        className="w-full h-24 border-dashed border-2"
                        data-testid="button-open-signature-modal"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-sm font-medium">
                            {copy?.signatureButtonText || "Add signature"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Draw, upload an image, or type your name
                          </span>
                        </div>
                      </Button>
                    )}

                    <SignatureModal
                      open={signatureModalOpen}
                      onOpenChange={setSignatureModalOpen}
                      onSave={setSignature}
                      existingSignature={signature}
                      copy={copy}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {hasInvalidFiles && files.length > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md border border-destructive/30">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-destructive">Cannot submit: One or more files do not meet the minimum requirements. Please upload different images or remove these files.</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => setCurrentStep(1)}
                      className="flex-1 h-14 rounded-full text-sm font-semibold"
                      data-testid="button-back-step2"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      onClick={onStep2Next}
                      disabled={submitting || files.length === 0 || hasInvalidFiles}
                      className="flex-1 h-14 rounded-full text-sm font-semibold"
                      data-testid="button-next-step2"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2">
                          Uploading {files.filter(f => f.status === "success").length + 1} of {files.length}...
                        </span>
                      ) : "Submit"}
                    </Button>
                  </div>
                </div>
                </form>
              </Form>
            </div>
          </div>
        )}

        {/* Step 3: Thank You */}
        {currentStep === 3 && (
          <ThankYouPage
            copy={copy}
            headingFontStyle={headingFontStyle}
            step1Data={step1Data}
            onUploadMore={() => {
              // Reset for new upload
              setFiles([]);
              setSignature("");
              setSignatureFile(null);
              form2.reset({ comments: "", artworkStory: "" });
              setCurrentStep(0);
            }}
          />
        )}
      </div>
      {/* Aspect Ratio Mismatch Dialog */}
      <AlertDialog 
        open={ratioMismatchDialog.open} 
        onOpenChange={(open) => setRatioMismatchDialog({ ...ratioMismatchDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Different Aspect Ratio Detected</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                The following file{ratioMismatchDialog.files.length > 1 ? 's have' : ' has'} a different aspect ratio than the original artwork:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {ratioMismatchDialog.files.map((filename, i) => (
                  <li key={i} className="text-sm font-medium">{filename}</li>
                ))}
              </ul>
              <p className="pt-2">
                Size-specific files should have the same aspect ratio as the original. If this is a different artwork, please upload it separately using the main upload area.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRatioMismatchDialog({ open: false, files: [] })}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Upload Reminder Dialog */}
      <AlertDialog open={showSingleUploadDialog} onOpenChange={setShowSingleUploadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload more artworks?</AlertDialogTitle>
            <AlertDialogDescription>
              You can upload multiple artworks in one go to save time. Would you like to add more pieces before submitting?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setShowSingleUploadDialog(false);
                handleFinalSubmit();
              }}
              data-testid="button-proceed-single"
            >
              Submit 1 artwork
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowSingleUploadDialog(false);
                // Scroll to upload area so user can add more
                const uploadArea = document.querySelector('[data-testid="input-file-upload"]');
                if (uploadArea) {
                  (uploadArea as HTMLElement).click();
                }
              }}
              data-testid="button-add-more"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add more
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showTagLimitDialog} onOpenChange={setShowTagLimitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tag limit reached</AlertDialogTitle>
            <AlertDialogDescription>
              A maximum of {MAX_TAGS_PER_CATEGORY} tags per category are allowed. Choose the most relevant tags.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowTagLimitDialog(false)} data-testid="button-tag-limit-ok">
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Separate component for Thank You page with feedback
function ThankYouPage({ 
  copy, 
  headingFontStyle, 
  step1Data,
  onUploadMore 
}: { 
  copy: any; 
  headingFontStyle: React.CSSProperties;
  step1Data: { artistName: string; artistEmail: string };
  onUploadMore: () => void;
}) {
  const [feedbackRating, setFeedbackRating] = useState<"positive" | "negative" | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const { toast } = useToast();

  const submitFeedback = async (skipText = false) => {
    if (!feedbackRating) return;
    
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: feedbackRating,
          feedback: skipText ? null : feedbackText || null,
          artistName: step1Data.artistName,
          artistEmail: step1Data.artistEmail,
        }),
      });
      
      if (response.ok) {
        setFeedbackSubmitted(true);
        toast({
          title: "Thank you for your feedback!",
          description: "Your response helps us improve.",
        });
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  return (
    <div className="text-center space-y-8 py-12">
      <div className="space-y-2">
        <h1 className="font-bold font-display text-[18px]" style={headingFontStyle}>
          {copy?.thankYouTitle || "Thank you! We have received your artwork submission."}
        </h1>
        <p className="text-muted-foreground text-[16px]">
          {copy?.thankYouSubtitle || "We will be in touch with any questions/issues."}
        </p>
      </div>
      {/* Upload More Button */}
      <div>
        <Button
          onClick={onUploadMore}
          size="lg"
          className="h-14 px-8 rounded-full text-sm font-semibold"
          data-testid="button-upload-more"
        >
          Upload More Artwork
        </Button>
      </div>
      {/* Feedback Section */}
      {!feedbackSubmitted ? (
        <div className="max-w-md mx-auto pt-8 border-t">
          <h3 className="font-semibold mb-4 text-[14px]" style={headingFontStyle}>
            How was your experience?
          </h3>
          
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={() => setFeedbackRating("positive")}
              className={`p-2 rounded-full transition-all ${
                feedbackRating === "positive"
                  ? "bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500"
                  : "bg-muted hover-elevate"
              }`}
              data-testid="button-feedback-positive"
            >
              <ThumbsUp className={`w-5 h-5 ${feedbackRating === "positive" ? "text-green-600" : "text-muted-foreground"}`} />
            </button>
            <button
              onClick={() => setFeedbackRating("negative")}
              className={`p-2 rounded-full transition-all ${
                feedbackRating === "negative"
                  ? "bg-red-100 dark:bg-red-900/30 ring-2 ring-red-500"
                  : "bg-muted hover-elevate"
              }`}
              data-testid="button-feedback-negative"
            >
              <ThumbsDown className={`w-5 h-5 ${feedbackRating === "negative" ? "text-red-600" : "text-muted-foreground"}`} />
            </button>
          </div>

          {feedbackRating && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {feedbackRating === "positive" 
                  ? "What did you like about the form?" 
                  : "What would make the form easier to use?"}
              </p>
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Share your thoughts (optional)..."
                className="resize-none rounded-xl"
                rows={3}
                data-testid="input-feedback-text"
              />
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => submitFeedback(true)}
                  data-testid="button-feedback-skip"
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={() => submitFeedback(false)}
                  data-testid="button-feedback-submit"
                >
                  Submit Feedback
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="pt-8 border-t">
          <p className="text-muted-foreground">Thanks for your feedback!</p>
        </div>
      )}
    </div>
  );
}
