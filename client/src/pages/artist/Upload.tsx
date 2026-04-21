import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { artistApiRequest } from "@/lib/artistApiRequest";
import { ArtworkUploader } from "@/components/ArtworkUploader";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, Info } from "lucide-react";
import type { ImageAnalysis } from "@/lib/imageUtils";

export default function ArtistUpload() {
  const { toast } = useToast();
  const { isImpersonating } = useImpersonation();
  const [submitted, setSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);

  const handleSubmit = async (
    files: Array<{ file: File; title: string; analysis: ImageAnalysis }>
  ) => {
    try {
      for (const item of files) {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("title", item.title);
        formData.append("widthPx", String(item.analysis.widthPx));
        formData.append("heightPx", String(item.analysis.heightPx));
        formData.append("dpi", String(item.analysis.dpi));
        formData.append("aspectRatio", item.analysis.aspectRatio);
        formData.append("maxPrintSize", item.analysis.maxPrintSize);
        formData.append("availableSizes", JSON.stringify(item.analysis.availableSizes));
        formData.append("calculatedSizes", JSON.stringify(item.analysis.availableSizes));

        await artistApiRequest("POST", "/api/artist/upload", formData);
      }

      setSubmittedCount(files.length);
      setSubmitted(true);
      toast({
        title: "Artworks submitted",
        description: `${files.length} artwork${files.length !== 1 ? "s" : ""} submitted successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isImpersonating) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Artwork Upload</CardTitle>
            <CardDescription>
              Artwork upload is not available in view-only mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You are viewing this artist's portal as an admin. Artists can upload new artwork from their own account.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900" data-testid="text-page-title">
          Artwork Upload
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Submit new artwork to your collection
        </p>
      </div>

      {submitted ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-green-100 rounded-full">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold">
              {submittedCount === 1 ? "Artwork submitted!" : `${submittedCount} artworks submitted!`}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your submission is now under review. We'll be in touch once it has been processed and is ready for your collection.
            </p>
            <button
              className="text-sm text-primary underline mt-2"
              onClick={() => setSubmitted(false)}
            >
              Submit more artwork
            </button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Please upload high-resolution artwork files (minimum 150 DPI). Supported formats: JPEG, PNG. Maximum file size: 300 MB per file.
            </AlertDescription>
          </Alert>

          <ArtworkUploader onSubmit={handleSubmit} />
        </>
      )}
    </div>
  );
}
