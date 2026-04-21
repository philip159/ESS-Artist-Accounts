import { useState, useCallback } from "react";
import { Upload, Image as ImageIcon, Check, AlertCircle, X, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/hooks/use-toast";
import { extractTitleFromFilename, type ImageAnalysis } from "@/lib/imageUtils";
import { useImageProcessor } from "@/hooks/useImageProcessor";
import { MIN_DPI } from "@shared/schema";

interface UploadedFile {
  id: string; // Stable unique identifier
  file: File;
  preview: string; // Full-res blob URL for card thumbnails
  mockupUrl: string; // 800px thumbnail for fast canvas rendering
  analysis: ImageAnalysis | null;
  analyzing: boolean;
  title: string;
  error: string | null;
}

interface ArtworkUploaderProps {
  onSubmit: (files: Array<{ file: File; title: string; analysis: ImageAnalysis }>) => void;
  onCancel?: () => void;
}

export function ArtworkUploader({ onSubmit, onCancel }: ArtworkUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSingleUploadDialog, setShowSingleUploadDialog] = useState(false);
  const { toast } = useToast();
  const { processImage } = useImageProcessor();

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (file) => file.type.startsWith("image/")
      );

      if (droppedFiles.length === 0) {
        toast({
          title: "Invalid files",
          description: "Please upload image files only",
          variant: "destructive",
        });
        return;
      }

      await processFiles(droppedFiles);
    },
    [toast]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const selectedFiles = Array.from(e.target.files);
      await processFiles(selectedFiles);
    },
    []
  );

  const MAX_FILE_SIZE_MB = 300;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const processFiles = async (newFiles: File[]) => {
    const oversizedFiles = newFiles.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversizedFiles.length > 0) {
      const names = oversizedFiles.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(0)}MB)`).join(", ");
      toast({
        title: `File${oversizedFiles.length > 1 ? "s" : ""} too large`,
        description: `${names} — maximum file size is ${MAX_FILE_SIZE_MB}MB.`,
        variant: "destructive",
        duration: 10000,
      });
      newFiles = newFiles.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
      if (newFiles.length === 0) return;
    }

    for (const file of newFiles) {
      const id = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      
      // Add file with preview URL
      const newFile: UploadedFile = {
        id,
        file,
        preview,
        mockupUrl: '', // Not used anymore - using preview instead
        analysis: null,
        analyzing: true,
        title: extractTitleFromFilename(file.name),
        error: null,
      };
      
      setFiles((prev) => [...prev, newFile]);
      
      // Use Worker for EXIF-based dimension detection
      try {
        const result = await processImage(file, 800);
        
        console.log('[ArtworkUploader] Worker analysis result:', {
          filename: file.name,
          widthPx: result.analysis?.widthPx,
          heightPx: result.analysis?.heightPx,
          orientation: result.analysis ? (result.analysis.widthPx > result.analysis.heightPx ? 'landscape' : 'portrait') : 'unknown'
        });
        
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { 
                  ...f, 
                  analysis: result.analysis, 
                  analyzing: false, 
                  error: result.analysis && result.analysis.availableSizes.length === 0 ? "Image resolution too low for any print size" : null 
                }
              : f
          )
        );
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, analyzing: false, error: "Failed to analyze image" }
              : f
          )
        );
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      URL.revokeObjectURL(updated[index].mockupUrl);
      updated.splice(index, 1);
      return updated;
    });
  };

  const updateTitle = (index: number, newTitle: string) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, title: newTitle } : f))
    );
  };

  const handleSubmit = () => {
    const validFiles = files.filter(f => f.analysis && !f.error);
    if (validFiles.length === 0) {
      toast({
        title: "No valid files",
        description: "Please upload images with sufficient resolution",
        variant: "destructive",
      });
      return;
    }

    // Show reminder dialog if only one piece is being uploaded
    if (validFiles.length === 1) {
      setShowSingleUploadDialog(true);
      return;
    }

    submitFiles(validFiles);
  };

  const submitFiles = (validFiles: UploadedFile[]) => {
    onSubmit(
      validFiles.map((f) => ({
        file: f.file,
        title: f.title,
        analysis: f.analysis!,
      }))
    );
  };

  const handleProceedWithSingle = () => {
    setShowSingleUploadDialog(false);
    const validFiles = files.filter(f => f.analysis && !f.error);
    submitFiles(validFiles);
  };

  const handleAddMore = () => {
    setShowSingleUploadDialog(false);
    // Trigger file input to add more files
    document.getElementById("file-upload")?.click();
  };

  const getDpiColor = (dpi: number) => {
    if (dpi >= MIN_DPI + 100) return "bg-green-500/10 text-green-700 dark:text-green-400";
    if (dpi >= MIN_DPI) return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    return "bg-red-500/10 text-red-700 dark:text-red-400";
  };

  return (
    <div className="space-y-8">
      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        className={`
          relative min-h-96 flex flex-col items-center justify-center
          border-2 border-dashed rounded-xl transition-all
          ${isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
          }
        `}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
          data-testid="input-file-upload"
        />
        
        <div className="text-center space-y-4 p-8">
          <div className="flex justify-center">
            <div className="p-6 bg-primary/10 rounded-full">
              <Upload className="w-12 h-12 text-primary" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">
              Drop your artwork here
            </h3>
            <p className="text-sm text-muted-foreground">
              or click to browse your files
            </p>
          </div>
          
          <Button
            onClick={() => document.getElementById("file-upload")?.click()}
            size="lg"
            data-testid="button-browse-files"
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Browse Files
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Minimum {MIN_DPI} DPI required • JPEG, PNG supported
          </p>
        </div>
      </div>

      {/* File Preview Cards */}
      {files.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-2xl font-semibold font-display">
            Uploaded Artworks ({files.length})
          </h3>
          
          <div className="grid grid-cols-1 gap-6">
            {files.map((file, index) => (
              <Card key={index} className={file.error ? "border-destructive" : ""}>
                <CardContent className="p-6">
                  <div className="flex gap-6">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted">
                        <img
                          src={file.preview}
                          alt={file.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 space-y-4">
                      {/* Title Input */}
                      <div className="space-y-2">
                        <Label htmlFor={`title-${index}`} className="text-sm font-medium">
                          Artwork Title
                        </Label>
                        <Input
                          id={`title-${index}`}
                          value={file.title}
                          onChange={(e) => updateTitle(index, e.target.value)}
                          placeholder="Enter artwork title"
                          className="h-12"
                          data-testid={`input-title-${index}`}
                        />
                      </div>

                      {/* Analysis Results */}
                      {file.analyzing && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          Analyzing image...
                        </div>
                      )}

                      {file.analysis && !file.error && (
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={getDpiColor(file.analysis.dpi)}>
                            {file.analysis.dpi} DPI
                          </Badge>
                          <Badge variant="outline">
                            {file.analysis.widthPx} × {file.analysis.heightPx}px
                          </Badge>
                          <Badge variant="outline">
                            {file.analysis.aspectRatio}
                          </Badge>
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            <Check className="w-3 h-3 mr-1" />
                            Max: {file.analysis.maxPrintSize}
                          </Badge>
                        </div>
                      )}

                      {file.error && (
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle className="w-4 h-4" />
                          {file.error}
                        </div>
                      )}

                      {file.analysis && file.analysis.availableSizes.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Available sizes: {file.analysis.availableSizes.length} options from {file.analysis.availableSizes[0]} to {file.analysis.availableSizes[file.analysis.availableSizes.length - 1]}
                        </p>
                      )}
                    </div>

                    {/* Remove Button */}
                    <div className="flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                        data-testid={`button-remove-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            {onCancel && (
              <Button variant="outline" onClick={onCancel} data-testid="button-cancel">
                Cancel
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={files.every((f) => !f.analysis || f.error)}
              size="lg"
              data-testid="button-submit-artworks"
            >
              <Check className="w-4 h-4 mr-2" />
              Submit {files.filter(f => f.analysis && !f.error).length} Artwork{files.filter(f => f.analysis && !f.error).length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

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
            <AlertDialogCancel onClick={handleProceedWithSingle} data-testid="button-proceed-single">
              Submit 1 artwork
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleAddMore} data-testid="button-add-more">
              <Plus className="w-4 h-4 mr-2" />
              Add more
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
