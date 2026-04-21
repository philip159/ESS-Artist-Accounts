import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Download } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { SignatureModal } from "@/components/SignatureModal";
import jsPDF from "jspdf";
import type { CreatorContract, FormSettings } from "@shared/schema";
import { BrandLogo } from "@/components/BrandLogo";
import logoImage from "@assets/east-side-studio-logo.png";
import { 
  getLegalSectionsWithNumbers, 
  replaceContractVariables 
} from "@shared/contractSections";

const countryCodes = [
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+1", country: "US", flag: "🇺🇸" },
  { code: "+1", country: "CA", flag: "🇨🇦" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+31", country: "NL", flag: "🇳🇱" },
  { code: "+46", country: "SE", flag: "🇸🇪" },
  { code: "+47", country: "NO", flag: "🇳🇴" },
  { code: "+45", country: "DK", flag: "🇩🇰" },
  { code: "+353", country: "IE", flag: "🇮🇪" },
  { code: "+32", country: "BE", flag: "🇧🇪" },
  { code: "+41", country: "CH", flag: "🇨🇭" },
  { code: "+43", country: "AT", flag: "🇦🇹" },
  { code: "+48", country: "PL", flag: "🇵🇱" },
  { code: "+351", country: "PT", flag: "🇵🇹" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+65", country: "SG", flag: "🇸🇬" },
  { code: "+852", country: "HK", flag: "🇭🇰" },
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+972", country: "IL", flag: "🇮🇱" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+27", country: "ZA", flag: "🇿🇦" },
  { code: "+64", country: "NZ", flag: "🇳🇿" },
];

const headingFontStyle = { fontFamily: "'Montserrat', sans-serif" };

function getTodayDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

interface ValidationResponse {
  valid: boolean;
  reason?: string;
  contract?: CreatorContract;
  creatorName?: string;
  companySignerName?: string;
  companySignatureUrl?: string;
}

export default function CreatorContractPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/creator-contract/:token");
  const token = params?.token;

  const [step, setStep] = useState<"welcome" | "details" | "collaboration" | "contract" | "review">("welcome");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [townCity, setTownCity] = useState("");
  const [countyState, setCountyState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [countryCode, setCountryCode] = useState("+44|UK");
  const [phone, setPhone] = useState("");
  
  // Agreement responses
  const [contentUsageAgreed, setContentUsageAgreed] = useState<boolean | null>(null);
  const [exclusivityAgreed, setExclusivityAgreed] = useState<boolean | null>(null);
  const [scheduleAgreed, setScheduleAgreed] = useState<boolean | null>(null);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [editingSection, setEditingSection] = useState<"name" | "address" | "phone" | "signature" | null>(null);

  // Derive the effective signer name from firstName/lastName, with fallback to typed signerName
  const getEffectiveSignerName = () => {
    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }
    return signerName.trim();
  };

  const { data: validation, isLoading } = useQuery<ValidationResponse>({
    queryKey: ["/api/creator-contract/validate", token],
    queryFn: async () => {
      if (!token) return { valid: false, reason: "No token provided" };
      const res = await fetch(`/api/creator-contract/validate/${token}`);
      return res.json();
    },
    enabled: !!token,
  });

  const { data: formSettings } = useQuery<FormSettings>({
    queryKey: ["/api/form-settings"],
  });

  const handleSignatureSave = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setShowSignatureModal(false);
  };

  const handleSubmit = async () => {
    const effectiveSignerName = getEffectiveSignerName();
    if (!signatureDataUrl || !effectiveSignerName) {
      toast({
        title: "Missing information",
        description: "Please enter your name and add your signature.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate required fields on submit
    if (!firstName.trim() || !lastName.trim() || !addressLine1.trim() || !townCity.trim() || !postcode.trim() || !phone.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields (name, address, and phone).",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiRequest("POST", `/api/creator-contract/sign/${token}`, {
        signerName: effectiveSignerName,
        signatureDataUrl,
        firstName,
        lastName,
        email,
        addressLine1,
        addressLine2,
        townCity,
        countyState,
        postcode,
        countryCode: countryCode.split("|")[0],
        phone,
        contentUsageAgreed,
        exclusivityAgreed,
        scheduleAgreed,
        paypalEmail,
      });
      const data = await response.json();

      if (data.success) {
        setIsComplete(true);
        toast({
          title: "Contract signed",
          description: "Thank you for signing the contract.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign the contract. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = () => {
    const effectiveSignerName = getEffectiveSignerName();
    if (!validation?.contract || !signatureDataUrl || !effectiveSignerName) return;
    const contract = validation.contract;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let yPos = margin;

    const addText = (text: string, isBold = false, fontSize = 10) => {
      pdf.setFont("helvetica", isBold ? "bold" : "normal");
      pdf.setFontSize(fontSize);
      const lines = pdf.splitTextToSize(text, contentWidth);
      for (const line of lines) {
        if (yPos > pageHeight - 30) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.text(line, margin, yPos);
        yPos += fontSize * 0.4;
      }
      yPos += 3;
    };

    // Add logo at the top with proper aspect ratio
    try {
      const img = new Image();
      img.src = logoImage;
      // Calculate aspect ratio from natural dimensions
      const aspectRatio = img.naturalWidth / img.naturalHeight || 6; // fallback to 6:1 ratio
      const logoWidth = 55;
      const logoHeight = logoWidth / aspectRatio;
      pdf.addImage(img, "PNG", (pageWidth - logoWidth) / 2, yPos, logoWidth, logoHeight);
      yPos += logoHeight + 8;
    } catch (e) {
      console.error("Failed to add logo to PDF:", e);
    }

    // Title
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("Contractual Agreement", pageWidth / 2, yPos, { align: "center" });
    yPos += 8;
    
    pdf.setFontSize(11);
    pdf.text("CREATIVE PARTNER COLLABORATION AGREEMENT", pageWidth / 2, yPos, { align: "center" });
    yPos += 6;
    
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text('("Agreement")', pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    // Parties section
    addText(`This Agreement is made on ${getTodayDate()} between:`, false, 10);
    yPos += 2;
    addText("1. East Side Studio London, a company incorporated in England & Wales, registered office 6 Patent House, 48 Morris Road, E14 6NU London, UK; and", false, 10);
    yPos += 2;
    const creatorAddress = addressLine1 ? `${addressLine1}, ${townCity}, ${postcode}` : "[Address]";
    addText(`2. ${effectiveSignerName || validation.creatorName || "[Creative Partner Name]"}, of ${creatorAddress} ("Creative Partner").`, false, 10);
    yPos += 2;
    addText("Brand and Creative Partner together are the \"Parties\".", false, 10);
    yPos += 8;

    // Separator line
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Section 1: Scope of Work (Deliverables)
    const deliverablesContent = contract.deliverablesContractContent || contract.deliverablesFormContent;
    if (deliverablesContent) {
      addText("1. SCOPE OF WORK", true, 11);
      addText(deliverablesContent, false, 10);
      yPos += 5;
    }

    // Section 2: Compensation (Payment)
    const payContent = contract.paymentContractContent || contract.paymentFormContent || contract.paymentContent;
    if (payContent) {
      addText("2. COMPENSATION", true, 11);
      addText(payContent, false, 10);
      addText(`PayPal Email: ${paypalEmail || "Not provided"}`, false, 10);
      yPos += 5;
    }

    // Section 3: Content Usage & Licence
    const usageContent = contract.contentUsageContractContent || contract.contentUsageFormContent || contract.contentUsageContent;
    if (usageContent) {
      addText("3. CONTENT USAGE & LICENCE", true, 11);
      addText(usageContent, false, 10);
      yPos += 5;
    }

    // Section 4: Exclusivity
    const exclusivityContent = contract.exclusivityContractContent || contract.exclusivityFormContent || contract.exclusivityContent;
    if (contract.exclusivityEnabled && exclusivityContent) {
      addText("4. EXCLUSIVITY", true, 11);
      addText(exclusivityContent, false, 10);
      yPos += 5;
    }

    // Section 5: Schedule & Deadlines
    const schedContent = contract.scheduleContractContent || contract.scheduleFormContent || contract.scheduleContent;
    if (schedContent) {
      addText("5. SCHEDULE & DEADLINES", true, 11);
      addText(schedContent, false, 10);
      yPos += 5;
    }

    // Standard Legal Terms - rendered from shared source
    const legalSections = getLegalSectionsWithNumbers(contract.exclusivityEnabled ?? false);
    for (const section of legalSections) {
      const content = replaceContractVariables(section.defaultContent, { creatorEmail: email || "[Email]" });
      addText(`${section.number}. ${section.title}`, true, 11);
      addText(content, false, 10);
      yPos += 5;
    }

    // Signature section
    yPos += 10;
    if (yPos > pageHeight - 100) {
      pdf.addPage();
      yPos = margin;
    }

    // Company signature section
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("(The Company)", margin, yPos);
    yPos += 10;

    // Company signature box
    const boxStartY = yPos;
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, yPos, 80, 35);
    
    // Add company signature image if available
    const companySignerName = validation?.companySignerName || "Philip Jobling";
    const companySignatureUrl = validation?.companySignatureUrl;
    if (companySignatureUrl) {
      try {
        pdf.addImage(companySignatureUrl, "PNG", margin + 10, yPos + 5, 60, 20);
      } catch {
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(9);
        pdf.text("[Company Signature]", margin + 20, yPos + 18);
      }
    }
    
    // Signed for and on behalf text
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Signed for and on behalf of East Side Studio", margin + 5, boxStartY + 28);
    pdf.text("London", margin + 5, boxStartY + 32);
    yPos = boxStartY + 40;
    
    // Company signer name and date
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(companySignerName, margin, yPos);
    yPos += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Printed Name", margin, yPos);
    yPos += 8;
    
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(getTodayDate(), margin, yPos);
    yPos += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Date", margin, yPos);
    yPos += 15;

    // Creator signature section
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("(The Creative Partner) - Signature", margin, yPos);
    yPos += 10;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(effectiveSignerName, margin, yPos);
    yPos += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Printed Name", margin, yPos);
    yPos += 8;
    
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(getTodayDate(), margin, yPos);
    yPos += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Date", margin, yPos);
    yPos += 10;

    try {
      if (signatureDataUrl.startsWith("data:")) {
        pdf.addImage(signatureDataUrl, "PNG", margin, yPos, 60, 25);
      }
    } catch {
      pdf.text("[Signature]", margin, yPos + 10);
    }

    const creatorNameForFilename = effectiveSignerName.replace(/\s+/g, '');
    pdf.save(`${creatorNameForFilename}_CreatorPartnership_Agreement_signed.pdf`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading contract...</p>
        </div>
      </div>
    );
  }

  if (!validation?.valid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center space-y-6">
          <BrandLogo className="mx-auto" />
          <p className="text-muted-foreground">
            {validation?.reason === "This contract has already been signed"
              ? "This contract has already been signed. If you need assistance, please contact your partnership manager."
              : validation?.reason === "This contract link has expired"
              ? "This contract link has expired. Please contact your partnership manager for assistance."
              : "This contract link is not valid. Please contact your partnership manager for assistance."}
          </p>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center space-y-6">
          <BrandLogo className="mx-auto" />
          <h2 className="text-xl font-bold font-display" style={headingFontStyle}>
            Contract Signed
          </h2>
          <p className="text-muted-foreground">
            Thank you for signing the contract. We will let you know once your artworks have shipped.
          </p>
          <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>
    );
  }

  const creatorHeroImageUrl = formSettings?.creatorHeroImageUrl;

  if (step === "welcome" && validation?.valid) {
    return (
      <div className="min-h-screen flex flex-col md:flex-row">
        {creatorHeroImageUrl ? (
          <div className="md:w-1/2 h-64 md:h-screen relative bg-gray-50">
            <img
              src={creatorHeroImageUrl}
              alt="East Side Studio"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="md:w-1/2 h-64 md:h-screen relative bg-gray-50 flex items-center justify-center p-12">
            <BrandLogo height={80} className="md:scale-150" />
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center items-center p-8 md:p-16 bg-white">
          <div className="max-w-md text-center space-y-6">
            <h1 className="text-xl font-bold font-display" style={headingFontStyle}>
              Let's make something beautiful!
            </h1>
            <p className="text-gray-600 leading-relaxed">
              Hello! We're so excited to collaborate with you — and really appreciate you being part of East Side Studio London's journey.
            </p>
            <p className="text-gray-600 leading-relaxed">
              This short form will help us gather all the details we need to confirm the partnership and get your artwork sent out.
            </p>
            <p className="text-gray-600 leading-relaxed">
              It should only take a few minutes. Let's get started!
            </p>
            <Button
              onClick={() => setStep("details")}
              size="lg"
              className="w-full h-14 rounded-full text-sm font-semibold"
              data-testid="button-start-contract"
            >
              Start
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Details collection step
  if (step === "details" && validation?.valid) {
    const handleDetailsSubmit = () => {
      if (!firstName.trim() || !lastName.trim() || !addressLine1.trim() || !townCity.trim() || !postcode.trim() || !phone.trim()) {
        toast({
          title: "Missing information",
          description: "Please fill in all required fields.",
          variant: "destructive",
        });
        return;
      }
      setSignerName(`${firstName.trim()} ${lastName.trim()}`);
      setStep("collaboration");
    };

    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <BrandLogo className="mx-auto" />
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-bold text-[14px]">First Name <span className="text-destructive">*</span></label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder=""
                  className="h-12 rounded-full"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <label className="font-bold text-[14px]">Last Name <span className="text-destructive">*</span></label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder=""
                  className="h-12 rounded-full"
                  data-testid="input-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-[14px]">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=""
                className="h-12 rounded-full"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <label className="font-bold text-[14px]">Address <span className="text-destructive">*</span></label>
              <p className="text-xs text-muted-foreground">We will send your artworks here.</p>
              <Input
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder=""
                className="h-12 rounded-full"
                data-testid="input-address-line1"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="font-bold text-[14px]">Town/City <span className="text-destructive">*</span></label>
                <Input
                  value={townCity}
                  onChange={(e) => setTownCity(e.target.value)}
                  placeholder=""
                  className="h-12 rounded-full"
                  data-testid="input-town-city"
                />
              </div>

              <div className="space-y-2">
                <label className="font-bold text-[14px]">County/State</label>
                <Input
                  value={countyState}
                  onChange={(e) => setCountyState(e.target.value)}
                  placeholder=""
                  className="h-12 rounded-full"
                  data-testid="input-county-state"
                />
              </div>

              <div className="space-y-2">
                <label className="font-bold text-[14px]">Postcode <span className="text-destructive">*</span></label>
                <Input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder=""
                  className="h-12 rounded-full"
                  data-testid="input-postcode"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-[14px]">Phone Number <span className="text-destructive">*</span></label>
              <p className="text-xs text-muted-foreground">We will give this to the courier to ensure smooth delivery. We promise not to use your phone number for any other use.</p>
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="w-[100px] h-12 rounded-full" data-testid="select-country-code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countryCodes.map((c) => (
                      <SelectItem key={`${c.country}-${c.code}`} value={`${c.code}|${c.country}`}>
                        {c.flag} {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder=""
                  className="flex-1 h-12 rounded-full"
                  data-testid="input-phone"
                />
              </div>
            </div>

            <div className="pt-4">
              <Button
                onClick={handleDetailsSubmit}
                size="lg"
                className="w-full h-14 rounded-full text-sm font-semibold"
                data-testid="button-submit-details"
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Collaboration step - The 5 sections
  if (step === "collaboration" && validation?.valid) {
    const contract = validation.contract;
    
    // Check if any agreement is explicitly set to "No"
    const hasDeclinedAgreement = 
      contentUsageAgreed === false || 
      (contract?.exclusivityEnabled && exclusivityAgreed === false) || 
      scheduleAgreed === false;

    const handleCollaborationSubmit = () => {
      if (contentUsageAgreed === null) {
        toast({ title: "Please answer the Content Usage Permissions question", variant: "destructive" });
        return;
      }
      if (contract?.exclusivityEnabled && exclusivityAgreed === null) {
        toast({ title: "Please answer the Short-Term Exclusivity question", variant: "destructive" });
        return;
      }
      if (scheduleAgreed === null) {
        toast({ title: "Please answer the Schedule question", variant: "destructive" });
        return;
      }
      if (hasDeclinedAgreement) {
        toast({ title: "Please speak to your partnership contact to discuss the terms", variant: "destructive" });
        return;
      }
      if (!paypalEmail.trim()) {
        toast({ title: "Please enter your PayPal email address", variant: "destructive" });
        return;
      }
      setStep("contract");
    };

    return (
      <div className="min-h-screen bg-white">
        {/* Progress indicator */}
        <div className="border-b bg-white sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">About You</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full border-2 border-primary bg-white flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <span className="text-sm font-medium">The Collaboration</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 bg-white" />
                <span className="text-sm text-muted-foreground">Contract</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 bg-white" />
                <span className="text-sm text-muted-foreground">Review</span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <BrandLogo height={32} />
            </div>
            <h1 className="text-xl font-bold font-display" style={headingFontStyle}>About The Collaboration</h1>
          </div>

          <div className="space-y-8">
            {/* Section 1: Introduction */}
            <div className="space-y-4">
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700">
                {contract?.introductionFormContent || contract?.introductionContent || "No introduction content provided."}
              </div>
            </div>

            <Separator />

            {/* Section 2: Content Usage Permissions */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={headingFontStyle}>Content Usage Permissions</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {contract?.contentUsageFormContent || contract?.contentUsageContent || "In exchange for the agreed fee, you grant East Side Studio London a world-wide, perpetual, royalty-free licence to use, edit and promote the content you create on any platform."}
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">Do you agree to the above terms? <span className="text-destructive">*</span></p>
                <RadioGroup
                  value={contentUsageAgreed === null ? undefined : contentUsageAgreed ? "yes" : "no"}
                  onValueChange={(v) => setContentUsageAgreed(v === "yes")}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id="content-yes" data-testid="radio-content-yes" />
                    <Label htmlFor="content-yes" className="text-sm">Yes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id="content-no" data-testid="radio-content-no" />
                    <Label htmlFor="content-no" className="text-sm">No</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            {/* Section 3: Short-Term Exclusivity (optional) */}
            {contract?.exclusivityEnabled && (
              <>
                <div className="space-y-4">
                  <h2 className="text-lg font-bold" style={headingFontStyle}>Short-Term Exclusivity</h2>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {contract?.exclusivityFormContent || contract?.exclusivityContent || "We ask for a 30-day exclusivity period following your first post."}
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Do you agree to this 30-day exclusivity period for art and wall decor brand partnerships? <span className="text-destructive">*</span></p>
                    <RadioGroup
                      value={exclusivityAgreed === null ? undefined : exclusivityAgreed ? "yes" : "no"}
                      onValueChange={(v) => setExclusivityAgreed(v === "yes")}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="yes" id="exclusivity-yes" data-testid="radio-exclusivity-yes" />
                        <Label htmlFor="exclusivity-yes" className="text-sm">Yes</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="no" id="exclusivity-no" data-testid="radio-exclusivity-no" />
                        <Label htmlFor="exclusivity-no" className="text-sm">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Section 4: Schedule */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={headingFontStyle}>Schedule</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {contract?.scheduleFormContent || contract?.scheduleContent || "We require content to be posted within 3 weeks of the delivery date."}
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">Will you be able to accommodate this timing request? <span className="text-destructive">*</span></p>
                <RadioGroup
                  value={scheduleAgreed === null ? undefined : scheduleAgreed ? "yes" : "no"}
                  onValueChange={(v) => setScheduleAgreed(v === "yes")}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id="schedule-yes" data-testid="radio-schedule-yes" />
                    <Label htmlFor="schedule-yes" className="text-sm">Yes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id="schedule-no" data-testid="radio-schedule-no" />
                    <Label htmlFor="schedule-no" className="text-sm">No</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            {/* Section 5: Payment */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={headingFontStyle}>Payment</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {contract?.paymentFormContent || contract?.paymentContent || "The collaboration fee will be paid within 14 days of your reel going live."}
              </p>
              <div className="space-y-2">
                <label className="font-bold text-[14px]">Paypal Email Address <span className="text-destructive">*</span></label>
                <p className="text-xs text-muted-foreground">So we can pay you!</p>
                <Input
                  type="email"
                  value={paypalEmail}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                  placeholder=""
                  className="h-12 rounded-full"
                  data-testid="input-paypal-email"
                />
              </div>
            </div>

            {hasDeclinedAgreement && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  Please speak to your partnership contact to discuss the terms of our collaboration.
                </p>
              </div>
            )}

            <div className="pt-4">
              <Button
                onClick={handleCollaborationSubmit}
                size="lg"
                className="w-full h-14 rounded-full text-sm font-semibold"
                disabled={hasDeclinedAgreement}
                data-testid="button-submit-collaboration"
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Review step - Allow editing of personal details before final submission
  if (step === "review" && validation?.valid) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="mb-8 flex justify-center">
            <BrandLogo className="h-8 w-auto mb-6" />
          </div>
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold" style={headingFontStyle}>
              Please review your submission.
            </h1>
            <p className="text-muted-foreground mt-1">
              Update any relevant information as needed.
            </p>
          </div>

          <Separator className="my-6" />

          {/* Name Section */}
          <div className="py-4">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setEditingSection(editingSection === "name" ? null : "name")}
                className="text-sm text-primary hover:underline"
                data-testid="button-edit-name"
              >
                Edit
              </button>
            </div>
            
            {editingSection === "name" ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">First Name:</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-firstname"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Last Name:</Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-lastname"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Email:</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-email"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">First Name:</span>
                  <span className="text-sm font-medium">{firstName || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Name:</span>
                  <span className="text-sm font-medium">{lastName || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <span className="text-sm font-medium">{email || "—"}</span>
                </div>
              </div>
            )}
          </div>

          <Separator className="my-2" />

          {/* Address Section */}
          <div className="py-4">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setEditingSection(editingSection === "address" ? null : "address")}
                className="text-sm text-primary hover:underline"
                data-testid="button-edit-address"
              >
                Edit
              </button>
            </div>
            
            {editingSection === "address" ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Address Line 1:</Label>
                  <Input
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-address1"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Address Line 2:</Label>
                  <Input
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-address2"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Town/City:</Label>
                  <Input
                    value={townCity}
                    onChange={(e) => setTownCity(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-city"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">County/State:</Label>
                  <Input
                    value={countyState}
                    onChange={(e) => setCountyState(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-county"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Postcode:</Label>
                  <Input
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    className="mt-1"
                    data-testid="input-review-postcode"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Home/Business Address:</span>
                  <span className="text-sm font-medium text-right">
                    {[addressLine1, addressLine2, townCity, countyState, postcode].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              </div>
            )}
          </div>

          <Separator className="my-2" />

          {/* Phone Section */}
          <div className="py-4">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setEditingSection(editingSection === "phone" ? null : "phone")}
                className="text-sm text-primary hover:underline"
                data-testid="button-edit-phone"
              >
                Edit
              </button>
            </div>
            
            {editingSection === "phone" ? (
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="w-28" data-testid="select-review-country-code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countryCodes.map((cc) => (
                      <SelectItem key={`${cc.code}-${cc.country}`} value={`${cc.code}|${cc.country}`}>
                        {cc.flag} {cc.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  className="flex-1"
                  data-testid="input-review-phone"
                />
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Phone Number:</span>
                <span className="text-sm font-medium">
                  {phone ? `${countryCode.split("|")[0]} ${phone}` : "—"}
                </span>
              </div>
            )}
          </div>

          <Separator className="my-2" />

          {/* Signature Section */}
          <div className="py-4">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setShowSignatureModal(true)}
                className="text-sm text-primary hover:underline"
                data-testid="button-edit-signature-review"
              >
                Edit
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Signature:</span>
              {signatureDataUrl ? (
                <img
                  src={signatureDataUrl || undefined}
                  alt="Your signature"
                  className="max-h-12"
                />
              ) : (
                <span className="text-sm text-muted-foreground italic">Unanswered</span>
              )}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Submit Button */}
          <div className="pt-4 flex justify-center">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              size="lg"
              className="px-12 rounded-full"
              data-testid="button-final-submit"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>

        <SignatureModal
          open={showSignatureModal}
          onOpenChange={setShowSignatureModal}
          onSave={handleSignatureSave}
          existingSignature={signatureDataUrl || undefined}
        />
      </div>
    );
  }

  const daysRemaining = validation.contract?.expiresAt
    ? Math.max(0, Math.ceil((new Date(validation.contract.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <BrandLogo className="mx-auto" />
          {daysRemaining !== null && (
            <p className="text-sm text-muted-foreground mt-4">
              This contract will expire in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="space-y-8">
          {/* Contract Introduction - Header only */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">Contractual Agreement</h1>
            <p className="text-center text-sm text-gray-700">
              Please read the contract carefully and sign at the bottom of this page. The finalised copy signed by both parties will be available to download at the end of the form.
            </p>
          </div>

          {/* Contract Summary with all sections */}
          <div className="border rounded-lg p-6 bg-gray-50 max-h-[400px] overflow-y-auto space-y-4">
            {/* Contract Introduction - Inside scrollable area */}
            <div className="text-center mb-4">
              <p className="text-sm font-bold uppercase tracking-wide">CREATIVE PARTNER COLLABORATION AGREEMENT</p>
              <p className="text-sm text-gray-600 mt-1">("Agreement")</p>
            </div>
            
            <div className="text-sm text-gray-700 space-y-2 mb-4">
              <p>This Agreement is made on {getTodayDate()} between:</p>
              <p>1. East Side Studio London, a company incorporated in England & Wales, registered office 6 Patent House, 48 Morris Road, E14 6NU London, UK; and</p>
              <p>2. {getEffectiveSignerName() || validation.creatorName || "[Creative Partner Name]"}, {addressLine1 ? `${addressLine1}, ${townCity}, ${postcode}` : "[Address]"} ("Creative Partner").</p>
              <p>Brand and Creative Partner together are the "Parties".</p>
            </div>

            <Separator className="my-4" />

            {/* 1. Scope of Work (Deliverables) */}
            {(validation.contract?.deliverablesContractContent || validation.contract?.deliverablesFormContent) && (
              <div>
                <p className="font-bold text-sm mb-1">1. SCOPE OF WORK</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{validation.contract?.deliverablesContractContent || validation.contract?.deliverablesFormContent}</p>
              </div>
            )}

            {/* 2. Compensation (Payment) */}
            {(validation.contract?.paymentContractContent || validation.contract?.paymentFormContent || validation.contract?.paymentContent) && (
              <div>
                <p className="font-bold text-sm mb-1">2. COMPENSATION</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{validation.contract?.paymentContractContent || validation.contract?.paymentFormContent || validation.contract?.paymentContent}</p>
                <p className="text-sm mt-1"><span className="font-medium">PayPal Email:</span> {paypalEmail}</p>
              </div>
            )}
            
            {/* 3. Content Usage & Licence */}
            {(validation.contract?.contentUsageContractContent || validation.contract?.contentUsageFormContent || validation.contract?.contentUsageContent) && (
              <div>
                <p className="font-bold text-sm mb-1">3. CONTENT USAGE & LICENCE</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{validation.contract?.contentUsageContractContent || validation.contract?.contentUsageFormContent || validation.contract?.contentUsageContent}</p>
                <p className="text-sm mt-1"><span className="font-medium">Your response:</span> {contentUsageAgreed ? "Yes, I agree" : "No"}</p>
              </div>
            )}
            
            {/* 4. Exclusivity */}
            {validation.contract?.exclusivityEnabled && (validation.contract?.exclusivityContractContent || validation.contract?.exclusivityFormContent || validation.contract?.exclusivityContent) && (
              <div>
                <p className="font-bold text-sm mb-1">4. EXCLUSIVITY</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{validation.contract?.exclusivityContractContent || validation.contract?.exclusivityFormContent || validation.contract?.exclusivityContent}</p>
                <p className="text-sm mt-1"><span className="font-medium">Your response:</span> {exclusivityAgreed ? "Yes, I agree" : "No"}</p>
              </div>
            )}
            
            {/* 5. Schedule & Deadlines */}
            {(validation.contract?.scheduleContractContent || validation.contract?.scheduleFormContent || validation.contract?.scheduleContent) && (
              <div>
                <p className="font-bold text-sm mb-1">5. SCHEDULE & DEADLINES</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{validation.contract?.scheduleContractContent || validation.contract?.scheduleFormContent || validation.contract?.scheduleContent}</p>
                <p className="text-sm mt-1"><span className="font-medium">Your response:</span> {scheduleAgreed ? "Yes, I can accommodate" : "No"}</p>
              </div>
            )}

            {/* Standard Legal Terms - rendered from shared source */}
            <Separator className="my-4" />
            <div className="space-y-4">
              {getLegalSectionsWithNumbers(validation.contract?.exclusivityEnabled ?? false).map((section) => (
                <div key={section.id}>
                  <p className="font-bold text-sm mb-1">{section.number}. {section.title}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {replaceContractVariables(section.defaultContent, { creatorEmail: email || "[Email]" })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Signatures Section */}
          <div className="space-y-6">
            <h3 className="text-center font-bold text-lg tracking-wide">SIGNATURES</h3>
            
            <div className="grid grid-cols-2 gap-8">
              {/* Company Signature - Left Column */}
              <div className="space-y-4">
                <h4 className="font-bold">(The Company)</h4>
                
                <div className="border rounded-lg p-4 bg-white min-h-[120px] flex flex-col items-center justify-center">
                  {validation?.companySignatureUrl ? (
                    <img
                      src={validation.companySignatureUrl}
                      alt="Company signature"
                      className="max-h-16 object-contain"
                    />
                  ) : (
                    <span className="text-gray-400 italic">[Company Signature]</span>
                  )}
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Signed for and on behalf of East Side<br />Studio London
                  </p>
                </div>
                
                <div>
                  <p className="font-medium">{validation?.companySignerName || "Philip Jobling"}</p>
                  <p className="text-sm text-muted-foreground">Printed Name</p>
                </div>
                
                <div>
                  <p className="font-medium">{getTodayDate()}</p>
                  <p className="text-sm text-muted-foreground">Date</p>
                </div>
              </div>

              {/* Creator Signature - Right Column */}
              <div className="space-y-4">
                <h4 className="font-bold">(The Creative Partner) - Signature</h4>
                
                <div>
                  <p className="font-medium text-[#8B4C5A]">{getEffectiveSignerName() || "[Creator Name]"}</p>
                  <p className="text-sm text-muted-foreground">Printed Name</p>
                </div>
                
                <div>
                  <p className="font-medium text-[#8B4C5A]">{getTodayDate()}</p>
                  <p className="text-sm text-muted-foreground">Date</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium">Signature <span className="text-red-500">*</span></p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    By electronically signing this document, you acknowledge and agree that your electronic 
                    signature is legally equivalent to a handwritten signature, and you consent to using 
                    electronic signatures for this and any related documents.
                  </p>
                </div>

                {signatureDataUrl ? (
                  <div className="relative border rounded-lg p-4 bg-white">
                    <img
                      src={signatureDataUrl}
                      alt="Your signature"
                      className="max-h-16 mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignatureModal(true)}
                      className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground"
                      data-testid="button-edit-signature"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowSignatureModal(true)}
                    className="w-full h-20 border-dashed border-gray-300"
                    data-testid="button-add-signature"
                  >
                    Add signature
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button
              onClick={() => setStep("review")}
              disabled={!signatureDataUrl || !getEffectiveSignerName()}
              size="lg"
              className="w-full h-14 rounded-full text-sm font-semibold"
              data-testid="button-continue-to-review"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>

      <SignatureModal
        open={showSignatureModal}
        onOpenChange={setShowSignatureModal}
        onSave={handleSignatureSave}
        existingSignature={signatureDataUrl || undefined}
      />
    </div>
  );
}
