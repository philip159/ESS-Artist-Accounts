import { useState, useRef, useCallback, useEffect, useMemo, useDeferredValue } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CheckCircle, Upload, X, Edit2, Download, AlertCircle, Info, Plus, HelpCircle, CheckCircle2, ChevronDown, Copy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { ProgressStepper } from "@/components/ProgressStepper";
import { SignatureModal } from "@/components/SignatureModal";
import { PrintSizesDropdown } from "@/components/PrintSizesDropdown";
import { FAQsDropdown } from "@/components/FAQsDropdown";
import { FramedMockup } from "@/components/FramedMockup";
import { useImageProcessor } from "@/hooks/useImageProcessor";
import { extractArtworkTitle } from "@/lib/titleExtractor";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandLogo } from "@/components/BrandLogo";
import type { FormSettings } from "@shared/schema";
import { PRINT_SIZES, ARTWORK_TAG_OPTIONS } from "@shared/schema";
import companySignatureImg from "@assets/company_signature.png";
import jsPDF from "jspdf";

const headingFontStyle = { fontFamily: "'Montserrat', sans-serif" };

const COMMON_EMAIL_TYPOS: Record<string, string> = {
  '.con': '.com',
  '.cpm': '.com',
  '.vom': '.com',
  'gmial.': 'gmail.',
  'gmal.': 'gmail.',
  'hotmal.': 'hotmail.',
  'outlok.': 'outlook.',
  'yahooo.': 'yahoo.',
};

function checkEmailTypos(email: string): string | null {
  const lowerEmail = email.toLowerCase();
  for (const [typo, correction] of Object.entries(COMMON_EMAIL_TYPOS)) {
    if (lowerEmail.includes(typo)) {
      return lowerEmail.replace(typo, correction);
    }
  }
  return null;
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

const artistInfoSchema = z.object({
  firstName: z.string().min(1, "Please enter your first name"),
  lastName: z.string().min(1, "Please enter your last name"),
  artistAlias: z.string().optional(),
  address: z.string().min(1, "Please enter your home or business address"),
  country: z.string().min(1, "Please enter your country"),
  email: z.string()
    .min(1, "Please enter your email")
    .email("Please enter a valid email")
    .refine((email) => {
      const suggestion = checkEmailTypos(email);
      return suggestion === null;
    }, (email) => {
      const suggestion = checkEmailTypos(email);
      return { message: `Did you mean "${suggestion}"? Please check for typos.` };
    }),
  bio: z.string()
    .min(200, "Please write at least 200 characters for your bio")
    .max(2000, "Bio should be under 2000 characters"),
});

type ArtistInfoData = z.infer<typeof artistInfoSchema>;

type FormStep = 1 | 2 | 3 | 4 | 5 | 6; // 1: Artist Info, 2: Contract, 3: Artwork, 4: Marketing, 5: Payment, 6: Finished

interface UploadedPhoto {
  file: File;
  preview: string;
}

interface UploadedFile {
  id: string;
  file: File;
  title: string;
  preview: string;
  mockupUrl: string;
  serverThumbnailUrl?: string; // Color-accurate thumbnail from server (for CMYK images)
  isCMYK?: boolean; // Whether the image uses CMYK color space
  status: "pending" | "uploading" | "success" | "error";
  errorMessage?: string;
  uploadProgress?: number;
  selectedSizes: string[];
  sizeAssignments?: string[];
  parentFileId?: string;
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

interface ContractTemplate {
  templateContent: string;
  companySignerName: string;
  companyName: string;
  companySignatureUrl: string | null;
  defaultCommissionRate: number;
}

function getTodayDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

interface OnboardingInvitation {
  id: number;
  token: string;
  artistEmail: string | null;
  artistName: string | null;
  status: "pending" | "used" | "expired";
  expiresAt: string;
  commissionRate: number;
  contractType: "exclusive" | "non_exclusive";
}

export default function ArtistOnboarding() {
  // Get token from URL
  const [, params] = useRoute("/onboarding/:token");
  const token = params?.token;

  // Validate token
  const { data: tokenValidation, isLoading: isValidatingToken } = useQuery<{
    valid: boolean;
    reason?: string;
    invitation?: OnboardingInvitation;
  }>({
    queryKey: ["/api/onboarding/validate", token],
    queryFn: async () => {
      if (!token) return { valid: false, reason: "No token provided" };
      const res = await fetch(`/api/onboarding/validate/${token}`);
      return res.json();
    },
    enabled: !!token,
  });

  const [currentStep, setCurrentStep] = useState<FormStep>(1);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [artistInfo, setArtistInfo] = useState<ArtistInfoData | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);
  const [signedContractId, setSignedContractId] = useState<string | null>(null);
  const [artistAccountId, setArtistAccountId] = useState<string | null>(null);
  const [invitationId, setInvitationId] = useState<number | null>(null);

  // Set invitation ID when validation succeeds
  useEffect(() => {
    if (tokenValidation?.valid && tokenValidation.invitation) {
      setInvitationId(tokenValidation.invitation.id);
    }
  }, [tokenValidation]);
  
  // Artwork upload state (matching ArtistSubmit.tsx patterns)
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [showTagLimitDialog, setShowTagLimitDialog] = useState(false);
  const MAX_TAGS_PER_CATEGORY = 3;
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  // Defer the selected index for expensive preview updates so selection ring appears immediately
  const deferredSelectedIndex = useDeferredValue(selectedFileIndex);
  const [localTitles, setLocalTitles] = useState<{[fileId: string]: string}>({});
  const [artworkSignatureDataUrl, setArtworkSignatureDataUrl] = useState<string | null>(null);
  const [showArtworkSignatureModal, setShowArtworkSignatureModal] = useState(false);
  const [marketingPreference, setMarketingPreference] = useState<"partner" | "no-partner" | null>(null);
  const [paypalEmail, setPaypalEmail] = useState("");
  
  // Form tracking state
  const [formSubmissionId, setFormSubmissionId] = useState<number | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const artworkFileInputRef = useRef<HTMLInputElement>(null);
  const titleUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const { processImage, cleanup } = useImageProcessor();

  // Get the contract type from the invitation (defaults to exclusive)
  const invitationContractType = tokenValidation?.invitation?.contractType || "exclusive";
  const invitationCommissionRate = tokenValidation?.invitation?.commissionRate ?? 18;

  const { data: contractTemplate } = useQuery<ContractTemplate>({
    queryKey: ["/api/contract-template", invitationContractType],
    queryFn: async () => {
      const response = await fetch(`/api/contract-template?contractType=${invitationContractType}`);
      if (!response.ok) throw new Error("Failed to fetch contract template");
      return response.json();
    },
  });

  const { data: formSettings } = useQuery<FormSettings>({
    queryKey: ["/api/form-settings"],
  });

  const copy = formSettings?.copy;

  const artistDisplayName = useMemo(() => {
    if (!artistInfo) return "";
    return artistInfo.artistAlias || `${artistInfo.firstName} ${artistInfo.lastName}`;
  }, [artistInfo]);

  // Get only parent files (no additional files) for preview and card display
  const parentFiles = useMemo(() => files.filter(f => !f.parentFileId), [files]);
  
  // Get the currently selected parent file for preview
  // Uses deferredSelectedIndex so the heavy preview update is deferred while selection ring is instant
  const selectedPreviewFile = useMemo(() => {
    const fileAtIndex = files[deferredSelectedIndex];
    if (fileAtIndex && !fileAtIndex.parentFileId) {
      return fileAtIndex;
    }
    if (fileAtIndex?.parentFileId) {
      const parent = files.find(f => f.id === fileAtIndex.parentFileId);
      if (parent) return parent;
    }
    return parentFiles[0] || null;
  }, [files, deferredSelectedIndex, parentFiles]);

  const form = useForm<ArtistInfoData>({
    resolver: zodResolver(artistInfoSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      artistAlias: "",
      address: "",
      country: "",
      email: "",
      bio: "",
    },
  });

  useEffect(() => {
    if (contractSigned) {
      const handlePopState = (e: PopStateEvent) => {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        toast({
          title: "Cannot go back",
          description: "The contract has already been signed and submitted.",
          variant: "destructive",
        });
      };

      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', handlePopState);
      
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [contractSigned, toast]);

  // Clean up worker and timeouts on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (titleUpdateTimeoutRef.current) {
        clearTimeout(titleUpdateTimeoutRef.current);
      }
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [cleanup]);

  // Autosave form tracking - creates/updates submission as user progresses
  const formValues = form.watch();
  useEffect(() => {
    // Only track when there's meaningful data
    const hasData = formValues.firstName || formValues.lastName || formValues.email;
    if (!hasData) return;

    // Debounce autosave
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        const fieldData: Record<string, string> = {
          firstName: formValues.firstName || "",
          lastName: formValues.lastName || "",
          artistAlias: formValues.artistAlias || "",
          email: formValues.email || "",
          address: formValues.address || "",
          bio: formValues.bio || "",
          currentStep: String(currentStep),
          contractSigned: String(contractSigned),
          artworkCount: String(files.length),
          marketingPreference: marketingPreference || "",
          paypalEmail: paypalEmail || "",
        };

        const actorName = formValues.firstName && formValues.lastName 
          ? `${formValues.firstName} ${formValues.lastName}` 
          : formValues.firstName || formValues.lastName || undefined;

        if (formSubmissionId) {
          // Update existing submission
          await apiRequest("PATCH", `/api/forms/submissions/${formSubmissionId}`, {
            data: fieldData,
            actorEmail: formValues.email || undefined,
            actorName,
            currentStep,
            totalSteps: 6,
            status: currentStep === 6 ? "completed" : "in_progress",
          });
        } else {
          // Create new submission
          const response = await apiRequest("POST", "/api/forms/onboarding/submissions", {
            actorEmail: formValues.email || undefined,
            actorName,
            data: fieldData,
            currentStep,
            totalSteps: 6,
            status: "in_progress",
          });
          const responseData = await response.json();
          setFormSubmissionId(responseData.id);
        }
      } catch (error) {
        console.error("Autosave failed:", error);
      }
    }, 2000); // 2 second debounce
  }, [formValues, currentStep, contractSigned, files.length, marketingPreference, paypalEmail, formSubmissionId]);

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    const newPhotos: UploadedPhoto[] = [];
    
    for (const file of Array.from(selectedFiles)) {
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload JPG, PNG, or WebP images only.",
          variant: "destructive",
        });
        continue;
      }
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: "Please upload images under 10MB.",
          variant: "destructive",
        });
        continue;
      }
      
      newPhotos.push({
        file,
        preview: URL.createObjectURL(file),
      });
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [toast]);

  const removePhoto = useCallback((index: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  }, []);

  // Artwork file handling (matching ArtistSubmit.tsx)
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validTypes = ['image/jpeg'];
    const maxSize = 500 * 1024 * 1024; // 500MB

    const validFiles: File[] = [];
    for (const file of selectedFiles) {
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name}: Only JPG/JPEG files are allowed.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name}: Maximum size is 500MB.`,
          variant: "destructive",
        });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const initialFiles: UploadedFile[] = validFiles.map((file) => {
      const preview = URL.createObjectURL(file);
      const baseTitle = extractArtworkTitle(file.name, artistDisplayName);

      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        title: baseTitle,
        preview,
        mockupUrl: '',
        status: "pending" as const,
        selectedSizes: [],
        styleTags: [],
        colourTags: [],
        moodTags: [],
        themeTags: [],
        analysis: undefined,
      };
    });

    setFiles((prev) => [...prev, ...initialFiles]);

    // Process each file in Web Worker
    validFiles.forEach(async (file, index) => {
      const fileObj = initialFiles[index];
      
      try {
        const result = await processImage(file, 800);

        // Single state update with client-side thumbnail (for card display)
        // Don't set serverThumbnailUrl yet - wait for server to confirm RGB/CMYK
        const availableSizes = result.analysis?.availableSizes || [];
        setFiles((prev) =>
          prev.map((f) => 
            f.id === fileObj.id 
              ? { 
                  ...f,
                  mockupUrl: result.thumbnailUrl,
                  analysis: result.analysis,
                  selectedSizes: availableSizes,
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
              f.id === fileObj.id 
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
                f.id === fileObj.id 
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
                      f.id === fileObj.id 
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
                  f.id === fileObj.id 
                    ? { ...f, serverThumbnailUrl: result.thumbnailUrl } 
                    : f
                )
              );
            }
          }
        }
      } catch (error) {
        console.error("Error processing file:", error);
        setFiles((prev) =>
          prev.map((f) => 
            f.id === fileObj.id 
              ? { ...f, analysis: null } 
              : f
          )
        );
      }
    });

    if (artworkFileInputRef.current) {
      artworkFileInputRef.current.value = '';
    }
  }, [toast, processImage, artistDisplayName]);

  const toggleSize = useCallback((fileIndex: number, size: string) => {
    setFiles((prev) =>
      prev.map((file, i) => {
        if (i !== fileIndex) return file;
        
        const newSelectedSizes = file.selectedSizes.includes(size)
          ? file.selectedSizes.filter(s => s !== size)
          : [...file.selectedSizes, size];
        
        return { ...file, selectedSizes: newSelectedSizes };
      })
    );
  }, []);

  const removeFile = useCallback((index: number) => {
    const fileToRemove = files[index];
    if (fileToRemove.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    if (fileToRemove.mockupUrl) {
      URL.revokeObjectURL(fileToRemove.mockupUrl);
    }
    setLocalTitles((prev) => {
      const newTitles = { ...prev };
      delete newTitles[fileToRemove.id];
      return newTitles;
    });
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (selectedFileIndex >= files.length - 1 && selectedFileIndex > 0) {
      setSelectedFileIndex(selectedFileIndex - 1);
    }
  }, [files, selectedFileIndex]);

  const updateTitle = useCallback((index: number, newTitle: string) => {
    const fileId = files[index]?.id;
    if (!fileId) return;
    
    setLocalTitles(prev => ({ ...prev, [fileId]: newTitle }));
    
    if (titleUpdateTimeoutRef.current) {
      clearTimeout(titleUpdateTimeoutRef.current);
    }
    
    titleUpdateTimeoutRef.current = setTimeout(() => {
      setFiles((prev) =>
        prev.map((file) => (file.id === fileId ? { ...file, title: newTitle } : file))
      );
    }, 300);
  }, [files]);

  const handleTitleBlur = useCallback((index: number) => {
    const fileId = files[index]?.id;
    if (!fileId) return;
    
    if (titleUpdateTimeoutRef.current) {
      clearTimeout(titleUpdateTimeoutRef.current);
      titleUpdateTimeoutRef.current = null;
    }
    
    const currentFile = files.find(f => f.id === fileId);
    if (!currentFile) return;
    
    let currentTitle = localTitles[fileId] ?? currentFile.title;
    
    if (artistDisplayName && artistDisplayName.trim()) {
      const nameParts = artistDisplayName.split(/\s+/);
      const fullNameRegex = new RegExp(
        `\\b${nameParts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`,
        'gi'
      );
      currentTitle = currentTitle.replace(fullNameRegex, '').replace(/\s+/g, ' ').trim();
    }

    setFiles((prev) =>
      prev.map((file) => (file.id === fileId ? { ...file, title: currentTitle } : file))
    );
    
    setLocalTitles(prev => ({ ...prev, [fileId]: currentTitle }));
  }, [files, localTitles, artistDisplayName]);

  // Handle additional files for an existing artwork
  const handleAdditionalFiles = useCallback(async (parentIndex: number, newFiles: File[]) => {
    const parentFile = files[parentIndex];
    if (!parentFile) return;

    if (!parentFile.analysis) {
      toast({
        title: "Please wait",
        description: "The parent artwork is still being analysed. Try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    const validTypes = ['image/jpeg'];
    const maxSize = 500 * 1024 * 1024; // 500MB
    
    const validFiles = newFiles.filter(file => {
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name}: Only JPG/JPEG files are allowed.`,
          variant: "destructive",
        });
        return false;
      }
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name}: Maximum size is 500MB.`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const additionalFiles: UploadedFile[] = validFiles.map((file) => {
      const preview = URL.createObjectURL(file);

      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        title: parentFile.title,
        preview,
        mockupUrl: '',
        status: "pending" as const,
        selectedSizes: [],
        sizeAssignments: [],
        parentFileId: parentFile.id,
        styleTags: [],
        colourTags: [],
        moodTags: [],
        themeTags: [],
        analysis: undefined,
      };
    });

    setFiles((prev) => {
      const newArr = [...prev];
      newArr.splice(parentIndex + 1, 0, ...additionalFiles);
      return newArr;
    });

    toast({
      title: `Additional files added for "${parentFile.title}".`,
    });

    validFiles.forEach(async (file, index) => {
      const fileObj = additionalFiles[index];
      
      try {
        const result = await processImage(file, 800);

        const availableSizes = result.analysis?.availableSizes || [];
        setFiles((prev) =>
          prev.map((f) => 
            f.id === fileObj.id 
              ? { 
                  ...f,
                  mockupUrl: result.thumbnailUrl,
                  analysis: result.analysis,
                  selectedSizes: availableSizes,
                } 
              : f
          )
        );
      } catch (error) {
        console.error("Error processing file:", error);
        setFiles((prev) =>
          prev.map((f) => 
            f.id === fileObj.id 
              ? { ...f, analysis: null } 
              : f
          )
        );
      }
    });
  }, [files, toast, processImage]);

  const handleArtworkSignatureSave = useCallback((dataUrl: string) => {
    setArtworkSignatureDataUrl(dataUrl);
    setShowArtworkSignatureModal(false);
  }, []);

  // Check if all files have been analyzed and are valid
  const allFilesAnalyzed = files.length > 0 && files.every((file) => file.analysis !== undefined);
  const hasInvalidFiles = allFilesAnalyzed && files.some((file) => file.selectedSizes.length < 2);
  const allFilesValid = files.length > 0 && allFilesAnalyzed && !hasInvalidFiles;

  const onStep1Submit = async (data: ArtistInfoData) => {
    if (photos.length === 0) {
      toast({
        title: "Photo required",
        description: "Please upload at least one artist photo.",
        variant: "destructive",
      });
      return;
    }

    setArtistInfo(data);
    setCurrentStep(2);
  };

  const onContractSubmit = async () => {
    if (!signatureDataUrl) {
      toast({
        title: "Signature required",
        description: "Please add your signature to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!artistInfo) return;

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("firstName", artistInfo.firstName);
      formData.append("lastName", artistInfo.lastName);
      formData.append("artistAlias", artistInfo.artistAlias || "");
      formData.append("address", artistInfo.address);
      formData.append("email", artistInfo.email);
      formData.append("bio", artistInfo.bio);
      formData.append("contractSignedDate", getTodayDate());
      formData.append("commissionRate", String(invitationCommissionRate));
      formData.append("signatureDataUrl", signatureDataUrl);
      formData.append("companySignerName", contractTemplate?.companySignerName || "Philip Jobling");
      formData.append("companySignatureUrl", contractTemplate?.companySignatureUrl || companySignatureImg);
      
      photos.forEach((photo, index) => {
        formData.append(`photo_${index}`, photo.file);
      });

      const response = await apiRequest("POST", "/api/artist-onboarding", formData);
      const result = await response.json();

      setContractSigned(true);
      if (result.signedContractId) {
        setSignedContractId(result.signedContractId);
      }
      if (result.artistAccountId) {
        setArtistAccountId(result.artistAccountId);
      }
      setCurrentStep(3);
      toast({
        title: "Contract signed!",
        description: "Now let's upload your artwork.",
      });
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Submission failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignatureSave = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setShowSignatureModal(false);
  };

  const uploadFileWithProgress = useCallback((formData: FormData, fileIndex: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastProgressTime = Date.now();
      let progressCheckInterval: ReturnType<typeof setInterval>;

      xhr.timeout = 300000; // 5 minute timeout

      xhr.upload.addEventListener('progress', (e) => {
        lastProgressTime = Date.now();
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) =>
            prev.map((f, i) => (i === fileIndex ? { ...f, uploadProgress: percentComplete } : f))
          );
        }
      });

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
          resolve();
        } else {
          let errorMessage = 'Upload failed';
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.message || errorResponse.error || errorMessage;
          } catch {
            // Use default message
          }
          reject(new Error(errorMessage));
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
  }, []);

  const onArtworkSubmit = async () => {
    if (files.length === 0) {
      toast({
        title: "No artworks uploaded",
        description: "Please upload at least one artwork.",
        variant: "destructive",
      });
      return;
    }

    if (!allFilesValid) {
      toast({
        title: "Invalid artworks",
        description: "Please ensure all artworks have at least 2 sizes selected.",
        variant: "destructive",
      });
      return;
    }

    if (!artworkSignatureDataUrl) {
      toast({
        title: "Signature required",
        description: "Please add your signature to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!artistInfo) return;

    setIsSubmitting(true);

    try {
      const uploadBatchId = crypto.randomUUID();
      
      for (let i = 0; i < files.length; i++) {
        const fileData = files[i];
        
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "uploading", uploadProgress: 0 } : f))
        );

        const formData = new FormData();
        formData.append("file", fileData.file);
        formData.append("artistName", artistDisplayName);
        formData.append("artistEmail", artistInfo.email);
        formData.append("title", fileData.title);
        formData.append("selectedSizes", JSON.stringify(fileData.selectedSizes));
        formData.append("uploadBatchId", uploadBatchId);
        formData.append("editionType", "open");
        formData.append("signature", artworkSignatureDataUrl);
        if (fileData.parentFileId) {
          formData.append("isAdditionalFile", "true");
        }
        if (fileData.styleTags.length > 0) formData.append("styleTags", JSON.stringify(fileData.styleTags));
        if (fileData.colourTags.length > 0) formData.append("colourTags", JSON.stringify(fileData.colourTags));
        if (fileData.moodTags.length > 0) formData.append("moodTags", JSON.stringify(fileData.moodTags));
        if (fileData.themeTags.length > 0) formData.append("themeTags", JSON.stringify(fileData.themeTags));

        await uploadFileWithProgress(formData, i);

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "success" } : f))
        );
      }

      await fetch("/api/artworks/batch-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadBatchId, skipEmails: true }),
      });

      setCurrentStep(4);
      toast({
        title: "Artworks submitted!",
        description: "Thank you for completing your onboarding.",
      });
    } catch (error) {
      console.error("Artwork submission error:", error);
      
      // Mark any uploading files as error
      setFiles((prev) =>
        prev.map((f) => (f.status === "uploading" ? { ...f, status: "error", errorMessage: (error as Error).message || "Upload failed" } : f))
      );
      
      toast({
        title: "Submission failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!artistInfo || !signatureDataUrl) return;

    const todayDate = getTodayDate();
    const fullName = `${artistInfo.firstName} ${artistInfo.lastName}`;
    const commissionRate = String(invitationCommissionRate);

    const contractContent = replaceVariables(
      contractTemplate?.templateContent || "",
      {
        "{{DATE}}": todayDate,
        "{{FULL_NAME}}": fullName,
        "{{ADDRESS}}": artistInfo.address,
        "{{COMMISSION}}": commissionRate,
      }
    );

    const companySignature = contractTemplate?.companySignatureUrl || companySignatureImg;
    const companySignerName = contractTemplate?.companySignerName || "Philip Jobling";

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPos = margin;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("ARTIST LICENSING AGREEMENT", pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      const lines = pdf.splitTextToSize(contractContent, contentWidth);
      
      const mainHeaderPattern = /^\d+\.\s+[A-Z]/;
      
      for (const line of lines) {
        if (yPos > pageHeight - 60) {
          pdf.addPage();
          yPos = margin;
        }
        
        if (mainHeaderPattern.test(line.trim())) {
          pdf.setFont("helvetica", "bold");
          pdf.text(line, margin, yPos);
          pdf.setFont("helvetica", "normal");
        } else {
          pdf.text(line, margin, yPos);
        }
        yPos += 5;
      }

      if (yPos > pageHeight - 80) {
        pdf.addPage();
        yPos = margin;
      }

      yPos += 15;
      pdf.setFontSize(9);

      const loadImage = (src: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL("image/png"));
            } else {
              reject(new Error("Could not get canvas context"));
            }
          };
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = src;
        });
      };

      const leftX = margin;
      const rightX = pageWidth / 2 + 5;
      const sigWidth = 40;
      const sigHeight = 15;

      try {
        const companyImgData = await loadImage(companySignature);
        pdf.addImage(companyImgData, "PNG", leftX, yPos, sigWidth, sigHeight);
      } catch {
        pdf.text("[Company Signature]", leftX, yPos + 8);
      }

      try {
        if (signatureDataUrl.startsWith("data:")) {
          pdf.addImage(signatureDataUrl, "PNG", rightX, yPos, sigWidth, sigHeight);
        }
      } catch {
        pdf.text("[Artist Signature]", rightX, yPos + 8);
      }

      yPos += sigHeight + 5;

      pdf.setFont("helvetica", "normal");
      pdf.text("Signed for East Side Studio London", leftX, yPos);
      pdf.text("(The Artist) - Signature", rightX, yPos);
      yPos += 8;

      pdf.setFont("helvetica", "bold");
      pdf.text(companySignerName, leftX, yPos);
      pdf.text(fullName, rightX, yPos);
      yPos += 5;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text("Printed Name", leftX, yPos);
      pdf.text("Printed Name", rightX, yPos);
      yPos += 8;

      pdf.setTextColor(0);
      pdf.setFontSize(9);
      pdf.text(todayDate, leftX, yPos);
      pdf.text(todayDate, rightX, yPos);
      yPos += 5;

      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text("Date", leftX, yPos);
      pdf.text("Date", rightX, yPos);

      const fileName = `Artist_Agreement_${artistInfo.lastName}_${artistInfo.firstName}_${todayDate}.pdf`;
      pdf.save(fileName);

      toast({
        title: "PDF Downloaded",
        description: "Your signed contract has been downloaded.",
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Download failed",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const bioLength = form.watch("bio")?.length || 0;
  const todayDate = getTodayDate();
  const fullName = artistInfo ? `${artistInfo.firstName} ${artistInfo.lastName}` : "";
  const commissionRate = String(invitationCommissionRate);

  const processedContractContent = artistInfo && contractTemplate
    ? replaceVariables(contractTemplate.templateContent, {
        "{{DATE}}": todayDate,
        "{{FULL_NAME}}": fullName,
        "{{ADDRESS}}": artistInfo.address,
        "{{COMMISSION}}": commissionRate,
      })
    : "";

  // Show loading state while validating token
  if (isValidatingToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  // Show error if token is invalid or expired
  if (!tokenValidation?.valid) {
    const isExpired = tokenValidation?.reason === "This invitation has expired";
    
    if (isExpired) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="max-w-md text-center space-y-6">
            <BrandLogo className="mx-auto" />
            <p className="text-muted-foreground">
              This onboarding link has now expired. Please contact your onboarding partner for assistance.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center space-y-6">
          <BrandLogo className="mx-auto" />
          <p className="text-muted-foreground">
            {tokenValidation?.reason === "This invitation has already been used"
              ? "This onboarding form has already been submitted. If you need to make changes, please contact your onboarding partner for assistance."
              : "This onboarding link is not valid. Please contact your onboarding partner for assistance."}
          </p>
        </div>
      </div>
    );
  }

  // Calculate days remaining
  const daysRemaining = tokenValidation?.invitation?.expiresAt 
    ? Math.max(0, Math.ceil((new Date(tokenValidation.invitation.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className={`mx-auto px-4 py-12 ${currentStep === 3 ? 'max-w-7xl' : 'max-w-3xl'}`}>
        <div className="text-center mb-12">
          <BrandLogo className="mx-auto" />
          {daysRemaining !== null && currentStep !== 6 && (
            <p className="text-sm text-muted-foreground mt-4">
              This form will expire in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="mb-8">
          <ProgressStepper
            steps={[
              { label: "Artist Info", status: currentStep > 1 ? "completed" : currentStep === 1 ? "current" : "upcoming" },
              { label: "Contract", status: currentStep > 2 ? "completed" : currentStep === 2 ? "current" : "upcoming" },
              { label: "Artwork", status: currentStep > 3 ? "completed" : currentStep === 3 ? "current" : "upcoming" },
              { label: "Marketing", status: currentStep > 4 ? "completed" : currentStep === 4 ? "current" : "upcoming" },
              { label: "Payment", status: currentStep > 5 ? "completed" : currentStep === 5 ? "current" : "upcoming" },
              { label: "Finished", status: currentStep === 6 ? "completed" : "upcoming" },
            ]}
          />
        </div>

        {currentStep === 1 && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold font-display" style={headingFontStyle}>
                Tell us about yourself
              </h2>
              <p className="text-muted-foreground text-sm">
                This information will be used to create your artist profile on our website.
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onStep1Submit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold text-[14px]">
                          First Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="h-12 rounded-full"
                            placeholder=""
                            {...field}
                            onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            data-testid="input-first-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold text-[14px]">
                          Last Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="h-12 rounded-full"
                            placeholder=""
                            {...field}
                            onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            data-testid="input-last-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="artistAlias"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[14px]">
                        Artist Alias
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Do you prefer to go by an alternative name? If yes, let us know and we will use it for your artwork listings.
                      </p>
                      <FormControl>
                        <Input
                          className="h-12 rounded-full"
                          placeholder=""
                          {...field}
                          data-testid="input-artist-alias"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[14px]">
                        Home/Business Address <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="h-12 rounded-full"
                          placeholder=""
                          {...field}
                          data-testid="input-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[14px]">
                        Country <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="h-12 rounded-full"
                          placeholder=""
                          {...field}
                          data-testid="input-country"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[14px]">
                        Email <span className="text-destructive">*</span>
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Please ensure your email address is valid.
                      </p>
                      <FormControl>
                        <Input
                          type="email"
                          className="h-12 rounded-full"
                          placeholder=""
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[14px]">
                        Artist Bio <span className="text-destructive">*</span>
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Minimum of 200 characters. Tell us about where you're from, your preferred artistic medium and style of artwork (E.g. illustration, graphic design, photography, etc) and your influences. Include anything else that might be of interest.
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Please write your biography in 3rd person. For example: Dani Martin, known in the art world as Bigotesucio, is a versatile artist whose work embodies a fusion of abstract art, graffiti, and graphic design. His artistic style is a vibrant interplay of shapes, colours, and textures, bringing digital concepts to life through various techniques and materials.
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Martin's creative process is deeply rooted in his surroundings, drawing inspiration from urban landscapes, social interactions, and digital platforms. Whether working in his well-lit home studio or collaborating at Espacio con Humo, he continually pushes the boundaries of his craft. His recent exhibition, Ultramegabum, showcases large-format pieces that exemplify his unique aesthetic, inviting viewers to immerse themselves in a world of dynamic forms and expressive doodles.
                      </p>
                      <FormControl>
                        <Textarea
                          className="min-h-[150px] rounded-xl resize-y"
                          placeholder=""
                          {...field}
                          data-testid="input-bio"
                        />
                      </FormControl>
                      <div className="flex justify-between items-center mt-1">
                        <FormMessage />
                        <span className={`text-xs ${bioLength < 200 ? 'text-muted-foreground' : 'text-green-600'}`}>
                          {bioLength}/200 characters minimum
                        </span>
                      </div>
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <div>
                    <label className="font-bold block text-[14px]">
                      Artist Photo <span className="text-destructive">*</span>
                    </label>
                    <p className="text-sm text-muted-foreground">
                      Feel free to upload more than one image. This can be an in-studio photo, headshot, or something more abstract.
                    </p>
                  </div>

                  {photos.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photos.map((photo, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={photo.preview}
                            alt={`Artist photo ${index + 1}`}
                            className="w-full aspect-square object-cover rounded-xl"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(index)}
                            className="absolute top-2 right-2 p-1.5 bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-remove-photo-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handlePhotoSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      data-testid="input-artist-photo"
                    />
                    <div className="border-2 border-dashed border-input rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drag & drop a file or <span className="text-primary underline">browse</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Max file size is 10 MB
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full h-14 rounded-full text-sm font-semibold"
                    data-testid="button-continue-to-contract"
                  >
                    Continue
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {currentStep === 2 && artistInfo && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold font-display" style={headingFontStyle}>
                Artist Agreement
              </h2>
              <p className="text-muted-foreground text-sm">
                Please review and sign the agreement below.
              </p>
            </div>

            <div className="bg-card border rounded-xl p-6 md:p-8 space-y-4 text-sm leading-relaxed max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
              {processedContractContent.split('\n').map((line, idx) => {
                const mainHeaderPattern = /^\d+\.\s+[A-Z]/;
                if (mainHeaderPattern.test(line)) {
                  return <span key={idx} className="font-bold">{line}{'\n'}</span>;
                }
                return <span key={idx}>{line}{'\n'}</span>;
              })}
            </div>

            <div className="border-t pt-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-bold text-lg" style={headingFontStyle}>
                    (The Company)
                  </h3>
                  <div className="border rounded-lg p-4 bg-white">
                    <img
                      src={contractTemplate?.companySignatureUrl || companySignatureImg}
                      alt="Company Signature"
                      className="h-16 mx-auto mb-2"
                    />
                    <p className="text-sm text-muted-foreground text-center">
                      Signed for and on behalf of East Side Studio London
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">{contractTemplate?.companySignerName || "Philip Jobling"}</p>
                    <p className="text-sm text-muted-foreground">Printed Name</p>
                  </div>
                  <div>
                    <p className="font-semibold">{todayDate}</p>
                    <p className="text-sm text-muted-foreground">Date</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-lg" style={headingFontStyle}>
                    (The Artist) - Signature
                  </h3>

                  <div>
                    <p className="text-[#8B2332] font-semibold">{fullName}</p>
                    <p className="text-sm text-muted-foreground font-medium">Printed Name</p>
                  </div>

                  <div>
                    <p className="text-[#8B2332] font-semibold">{todayDate}</p>
                    <p className="text-sm text-muted-foreground font-medium">Date</p>
                  </div>

                  <div className="space-y-2">
                    <p className="font-bold text-[14px]">
                      Signature <span className="text-destructive">*</span>
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      By electronically signing this document, you acknowledge and agree that your electronic signature is legally equivalent to a handwritten signature, and you consent to using electronic signatures for this and any related documents. You confirm that you have the necessary technology to view, save, and transmit electronic records, have provided a valid email address, and are authorized to sign this agreement. You understand that your electronic signature creates a legally binding agreement that cannot be denied legal effect solely because it is in electronic form, and you accept responsibility for maintaining the confidentiality of your authentication credentials. You may request a paper copy of this agreement or withdraw consent for future electronic signatures by contacting us.
                    </p>

                    {signatureDataUrl ? (
                      <div className="relative border rounded-xl p-4 bg-white">
                        <img
                          src={signatureDataUrl}
                          alt="Your signature"
                          className="max-h-24 mx-auto"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignatureModal(true)}
                          className="absolute top-2 right-2 p-1.5 bg-background/80 rounded-full hover:bg-background transition-colors"
                          data-testid="button-edit-signature"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowSignatureModal(true)}
                        className="w-full h-12 rounded-full"
                        data-testid="button-add-signature"
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Add signature
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setCurrentStep(1)}
                  className="h-14 rounded-full"
                  data-testid="button-back-to-info"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={onContractSubmit}
                  disabled={isSubmitting || !signatureDataUrl}
                  className="flex-1 h-14 rounded-full text-sm font-semibold"
                  data-testid="button-submit-contract"
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: File Upload - Exact replica from ArtistSubmit.tsx */}
        {currentStep === 3 && artistInfo && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-bold font-display" style={headingFontStyle}>
                {copy?.step2Title || "Upload Artwork"}
              </h1>
              <p className="text-muted-foreground text-[14px]">{copy?.step2Subtitle || "Before uploading your artworks, please review the available print sizes and FAQs. We recommend uploading artworks at 300DPI, but we will accept a minimum of 200DPI."}</p>
              <p className="text-muted-foreground text-[14px] mt-2">Your collection will need a minimum of three pieces. We generally recommend submitting 5-10 pieces to start with, so that customers have a choice of artworks to choose from. Artists with bigger collections tend to have more sales than artists with smaller collections.</p>
            </div>

            <div className={`grid grid-cols-1 gap-8 ${files.length > 0 ? 'lg:grid-cols-[3fr_2fr]' : ''}`}>
              {/* Left Column: Upload Form */}
              <div className={files.length === 0 ? 'max-w-2xl mx-auto w-full' : ''}>
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="font-bold block text-[14px]">
                        {copy?.uploadLabel || "Upload Files"} <span className="text-destructive">*</span>
                      </label>
                      <p className="text-sm text-muted-foreground">{copy?.uploadHelpText || "Drag and drop or click below to upload your files. You can upload multiple artworks at once. We accept JPG files only."}</p>
                      <div className="relative">
                        <input
                          ref={artworkFileInputRef}
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
                      faqs={formSettings?.printSizeFAQs?.openEdition || []}
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
                                <li><strong>Different ratios:</strong> If you have the same artwork in different ratios (e.g., 3:4 & 4:5), upload each ratio as a separate artwork with the same title - they will be merged into one listing.</li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        {parentFiles.map((fileData) => {
                          const additionalFilesCount = files.filter(f => f.parentFileId === fileData.id).length;
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
                                          {formSettings?.additionalFilesHelperText || "Upload alternative versions of this artwork optimised for specific print sizes. This gives you more control over borders and details at different sizes."}
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
                                      onClick={(e) => e.stopPropagation()}
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
                                                          onClick={(e) => e.stopPropagation()}
                                                          data-testid={`checkbox-size-${actualIndex}-${size}`}
                                                        />
                                                        <label
                                                          htmlFor={`size-${actualIndex}-${size}`}
                                                          className={`text-xs font-medium cursor-pointer ${wouldBeLastTwo ? 'text-muted-foreground' : ''}`}
                                                          onClick={(e) => e.stopPropagation()}
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
                                                                          prev.map((f, idx) => {
                                                                            if (idx !== actualIndex) return f;
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
                                                                      prev.map((f, idx) => {
                                                                        if (idx !== actualIndex) return f;
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
                                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
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
                                      <div className="flex-1 space-y-1">
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
                                      <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-md border border-destructive/30">
                                        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                          <p className="text-xs text-destructive font-medium">Upload failed</p>
                                          <p className="text-xs text-destructive/80 mt-0.5">
                                            {fileData.errorMessage || "An error occurred during upload"}
                                          </p>
                                        </div>
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
                                            {formSettings?.additionalFilesHelperText || "Upload alternative versions of this artwork optimised for specific print sizes. This gives you more control over borders and details at different sizes."}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <span className="text-xs text-muted-foreground">Add files (optional){additionalFilesCount > 0 && ` (${additionalFilesCount})`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Right Column: Framed Mockup Preview - Hidden until files are uploaded */}
              {parentFiles.length > 0 && selectedPreviewFile && (
                <div className="relative">
                  <div className="sticky top-4 h-fit">
                    {selectedPreviewFile.analysis && 
                     selectedPreviewFile.analysis.availableSizes.length > 0 && 
                     selectedPreviewFile.selectedSizes.length > 0 && (
                    <>
                      {/* Show preview immediately using client thumbnail, upgrade to server thumbnail when ready */}
                      {(selectedPreviewFile.mockupUrl || selectedPreviewFile.serverThumbnailUrl) ? (
                        <FramedMockup
                          imageUrl={selectedPreviewFile.serverThumbnailUrl || selectedPreviewFile.mockupUrl}
                          fallbackUrl={selectedPreviewFile.mockupUrl}
                          title={selectedPreviewFile.title || "Untitled"}
                          artistName={artistDisplayName}
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
                          hideAdminControls={true}
                          editionType="open"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 space-y-4">
                          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Preparing Preview</p>
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
              <div className="space-y-8">
                {/* Signature - Confirmation */}
                <div className="space-y-4">
                  <div>
                    <label className="font-bold text-[14px] block mb-2">
                      {copy?.step3Title || "Confirmation"} <span className="text-destructive">*</span>
                    </label>
                    <p className="text-sm text-muted-foreground mb-4">
                      {copy?.signatureStatement || "I confirm these artworks are exclusive to East Side Studio London for sale as fine art prints."}
                    </p>
                  </div>

                  {artworkSignatureDataUrl ? (
                    <div className="space-y-3">
                      <div className="border-2 border-input rounded-lg p-4 bg-white">
                        <img
                          src={artworkSignatureDataUrl}
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
                          onClick={() => setShowArtworkSignatureModal(true)}
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
                      onClick={() => setShowArtworkSignatureModal(true)}
                      className="w-full h-24 border-dashed border-2 rounded-full"
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
                </div>

                <div className="space-y-2">
                  {hasInvalidFiles && files.length > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md border border-destructive/30">
                      <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-destructive">Cannot submit: One or more files do not meet the minimum requirements. Please upload different images or remove these files.</p>
                    </div>
                  )}
                  {parentFiles.length > 0 && parentFiles.length < 3 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-300 dark:border-amber-700">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-700 dark:text-amber-300">You need to upload at least 3 artworks to continue. Currently uploaded: {parentFiles.length}/3</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    {!contractSigned && (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => setCurrentStep(2)}
                        className="flex-1 h-14 rounded-full text-sm font-semibold"
                        data-testid="button-back-step2"
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="lg"
                      onClick={onArtworkSubmit}
                      disabled={isSubmitting || parentFiles.length < 3 || hasInvalidFiles || !artworkSignatureDataUrl}
                      className="flex-1 h-14 rounded-full text-sm font-semibold"
                      data-testid="button-submit-artworks"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          Uploading {files.filter(f => f.status === "success").length + 1} of {files.length}...
                        </span>
                      ) : "Submit"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Marketing Preference */}
        {currentStep === 4 && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold font-display" style={headingFontStyle}>
                Marketing Partnership
              </h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <label className="font-bold block text-[14px]">
                  As part of our marketing efforts, we will often create content specifically to be used as a 'Partnership Post' on Instagram. Please confirm if you're happy to partner with us. <span className="text-destructive">*</span>
                </label>
                <p className="text-sm text-muted-foreground">
                  An Instagram 'Partnership Post' is one which is shared on our company profile as well as your own. It's perfect for artists who want greater reach and for those who may not have much time to create content of their own (although we suggest you do so)
                </p>
              </div>

              <div className="space-y-3">
                <div
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    marketingPreference === "partner"
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-accent/50"
                  }`}
                  onClick={() => setMarketingPreference("partner")}
                  data-testid="option-marketing-partner"
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    marketingPreference === "partner" ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {marketingPreference === "partner" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-sm">Yes, I'm happy to partner with you. (Recommended)</span>
                </div>

                <div
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    marketingPreference === "no-partner"
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-accent/50"
                  }`}
                  onClick={() => setMarketingPreference("no-partner")}
                  data-testid="option-marketing-no-partner"
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    marketingPreference === "no-partner" ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {marketingPreference === "no-partner" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-sm">I'd prefer not to partner with you on Instagram posts.</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setCurrentStep(3)}
                  className="flex-1 h-14 rounded-full text-sm font-semibold"
                  data-testid="button-back-step3"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => setCurrentStep(5)}
                  disabled={!marketingPreference}
                  className="flex-1 h-14 rounded-full text-sm font-semibold"
                  data-testid="button-next-step4"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Payment Details */}
        {currentStep === 5 && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold font-display" style={headingFontStyle}>
                Payment Details
              </h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="font-bold block text-[14px]">
                  Paypal email address <span className="text-destructive">*</span>
                </label>
                <p className="text-sm text-muted-foreground">
                  We require a Paypal address in order to pay you commissions owed.
                </p>
              </div>

              <Input
                type="email"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="h-12 rounded-full"
                data-testid="input-paypal-email"
              />

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setCurrentStep(4)}
                  className="flex-1 h-14 rounded-full text-sm font-semibold"
                  data-testid="button-back-step4"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={async () => {
                    // Save PayPal email to artist account
                    if (artistAccountId && paypalEmail) {
                      try {
                        await apiRequest("PATCH", `/api/onboarding/artist-account/${artistAccountId}/paypal`, {
                          paypalEmail: paypalEmail.trim(),
                        });
                      } catch (error) {
                        console.error("Error saving PayPal email:", error);
                      }
                    }
                    
                    // Send onboarding completion emails and trigger Zapier webhook
                    if (artistAccountId && artistInfo) {
                      try {
                        await apiRequest("POST", "/api/onboarding/complete", {
                          artistAccountId,
                          artistName: artistInfo.artistAlias || `${artistInfo.firstName} ${artistInfo.lastName}`,
                          artistEmail: artistInfo.email,
                          artworkCount: parentFiles.length,
                          firstName: artistInfo.firstName,
                          lastName: artistInfo.lastName,
                          country: artistInfo.country,
                        });
                      } catch (error) {
                        console.error("Error sending completion emails:", error);
                      }
                    }

                    // Mark invitation as used
                    if (invitationId) {
                      try {
                        await apiRequest("PATCH", `/api/onboarding-invitations/${invitationId}/use`, {
                          formSubmissionId: formSubmissionId?.toString(),
                        });
                      } catch (error) {
                        console.error("Error marking invitation as used:", error);
                      }
                    }
                    
                    setCurrentStep(6);
                  }}
                  disabled={!paypalEmail || !paypalEmail.includes("@")}
                  className="flex-1 h-14 rounded-full text-sm font-semibold"
                  data-testid="button-next-step5"
                >
                  Submit
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Thank You */}
        {currentStep === 6 && (
          <div className="text-center space-y-8 py-12">
            <div className="space-y-4">
              <h2 className="text-xl font-bold font-display" style={headingFontStyle}>
                Thank You!
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Your artist profile and artworks have been submitted successfully. We'll review your submission and get back to you soon.
              </p>
            </div>

            <div className="pt-4">
              <Button
                onClick={handleDownloadPDF}
                variant="outline"
                size="lg"
                className="h-14 rounded-full px-8"
                data-testid="button-download-contract"
              >
                <Download className="w-5 h-5 mr-2" />
                Download Signed Contract (PDF)
              </Button>
            </div>
          </div>
        )}
      </div>

      <SignatureModal
        open={showSignatureModal}
        onOpenChange={setShowSignatureModal}
        onSave={handleSignatureSave}
        existingSignature={signatureDataUrl || undefined}
      />

      <SignatureModal
        open={showArtworkSignatureModal}
        onOpenChange={setShowArtworkSignatureModal}
        onSave={handleArtworkSignatureSave}
        existingSignature={artworkSignatureDataUrl || undefined}
        copy={copy}
      />

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
