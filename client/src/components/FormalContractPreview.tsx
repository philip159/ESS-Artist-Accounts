import { format } from "date-fns";
import companySignatureImg from "@assets/company_signature.png";
import { 
  getLegalSectionsWithNumbers, 
  getDefaultLegalTerms,
  replaceContractVariables 
} from "@shared/contractSections";

interface FormalContractPreviewProps {
  creatorName?: string;
  creatorAddress?: string;
  contractDate?: Date;
  introductionContent?: string;
  deliverablesContent?: string;
  contentUsageContent?: string;
  exclusivityEnabled: boolean;
  exclusivityContent?: string;
  scheduleContent?: string;
  paymentContent?: string;
  // Legal terms (optional - will use defaults if not provided)
  legalComplianceContent?: string;
  moralityContent?: string;
  independentContractorContent?: string;
  forceMajeureContent?: string;
  disputeResolutionContent?: string;
  takedownContent?: string;
  terminationContent?: string;
  indemnityContent?: string;
  confidentialityContent?: string;
  dataProtectionContent?: string;
  insuranceContent?: string;
  languageContent?: string;
  boilerplateContent?: string;
}

// Get defaults from shared source
const defaultLegalTerms = getDefaultLegalTerms();

export function FormalContractPreview({
  creatorName = "[Creator Name]",
  creatorAddress = "[Address]",
  contractDate = new Date(),
  introductionContent,
  deliverablesContent,
  contentUsageContent,
  exclusivityEnabled,
  exclusivityContent,
  scheduleContent,
  paymentContent,
  legalComplianceContent,
  moralityContent,
  independentContractorContent,
  forceMajeureContent,
  disputeResolutionContent,
  takedownContent,
  terminationContent,
  indemnityContent,
  confidentialityContent,
  dataProtectionContent,
  insuranceContent,
  languageContent,
  boilerplateContent,
}: FormalContractPreviewProps) {
  const formattedDate = format(contractDate, "yyyy-MM-dd");
  
  // Content overrides map - allows props to override shared defaults
  const contentOverrides: Record<string, string | undefined> = {
    legalCompliance: legalComplianceContent,
    morality: moralityContent,
    independentContractor: independentContractorContent,
    forceMajeure: forceMajeureContent,
    disputeResolution: disputeResolutionContent,
    takedown: takedownContent,
    termination: terminationContent,
    indemnity: indemnityContent,
    confidentiality: confidentialityContent,
    dataProtection: dataProtectionContent,
    insurance: insuranceContent,
    language: languageContent,
    boilerplate: boilerplateContent,
  };
  
  // Get legal sections with proper numbering from shared source
  const legalSections = getLegalSectionsWithNumbers(exclusivityEnabled);

  return (
    <div className="text-xs leading-relaxed font-mono space-y-4">
      <p className="text-center text-muted-foreground text-[10px]">
        Please read the contract carefully and sign at the bottom of this page. The finalised copy signed by both parties will be available to download at the end of the form.
      </p>

      <div className="text-center space-y-1">
        <h2 className="font-bold text-sm">Contractual Agreement</h2>
        <h3 className="font-bold text-xs">CREATIVE PARTNER COLLABORATION AGREEMENT</h3>
        <p className="text-muted-foreground text-[10px]">("Agreement")</p>
      </div>

      <p>
        This Agreement is made on <span className="font-semibold">{formattedDate}</span> between:
      </p>

      <div className="space-y-2 pl-4">
        <p>1. <strong>East Side Studio London</strong>, a company incorporated in England & Wales, registered office 6 Patent House, 48 Morris Road, E14 6NU London, UK; and</p>
        <p>2. <strong>{creatorName}</strong>, of {creatorAddress} ("Creative Partner").</p>
      </div>

      <p>Brand and Creative Partner together are the "Parties".</p>

      <div className="border-t border-dashed pt-4 space-y-3">
        <h4 className="font-bold">1. SCOPE OF WORK</h4>
        {introductionContent && (
          <div className="whitespace-pre-wrap bg-primary/5 p-2 border border-primary/20">
            {introductionContent}
          </div>
        )}
        <p className="text-muted-foreground italic">Deliverables & Requirements</p>
        <div className="whitespace-pre-wrap bg-primary/5 p-2 border border-primary/20">
          {deliverablesContent || "[Deliverables will appear here]"}
        </div>
      </div>

      <div className="border-t border-dashed pt-4">
        <h4 className="font-bold">2. COMPENSATION</h4>
        <div className="mt-2 whitespace-pre-wrap bg-primary/5 p-2 border border-primary/20">
          {paymentContent || "[Payment details will appear here]"}
        </div>
      </div>

      <div className="border-t border-dashed pt-4">
        <h4 className="font-bold">3. USAGE RIGHTS</h4>
        <div className="mt-2 whitespace-pre-wrap bg-primary/5 p-2 border border-primary/20">
          {contentUsageContent || "[Content usage terms will appear here]"}
        </div>
      </div>

      {exclusivityEnabled && (
        <div className="border-t border-dashed pt-4">
          <h4 className="font-bold">4. EXCLUSIVITY</h4>
          <div className="mt-2 whitespace-pre-wrap bg-primary/5 p-2 border border-primary/20">
            {exclusivityContent || "[Exclusivity terms will appear here]"}
          </div>
        </div>
      )}

      <div className="border-t border-dashed pt-4">
        <h4 className="font-bold">{exclusivityEnabled ? "5" : "4"}. SCHEDULE & DEADLINES</h4>
        <div className="mt-2 whitespace-pre-wrap bg-primary/5 p-2 border border-primary/20">
          {scheduleContent || "[Schedule requirements will appear here]"}
        </div>
      </div>

      {/* Legal sections - rendered from shared source */}
      {legalSections.map((section, index) => {
        const content = contentOverrides[section.id] || section.defaultContent;
        const processedContent = replaceContractVariables(content, { creatorEmail: "{{CREATOR_EMAIL}}" });
        return (
          <div key={section.id} className="border-t border-dashed pt-4 text-muted-foreground">
            {index === 0 && (
              <p className="text-[10px] italic mb-2">The following sections are standard legal terms included in all contracts:</p>
            )}
            <h4 className="font-bold">{section.number}. {section.title}</h4>
            <p className="mt-1 text-[10px] whitespace-pre-wrap">{processedContent}</p>
          </div>
        );
      })}

      <div className="border-t border-dashed pt-4">
        <h4 className="font-bold text-center mb-4">SIGNATURES</h4>
        <div className="grid grid-cols-2 gap-6">
          {/* Left: The Company */}
          <div className="space-y-3">
            <h5 className="font-bold text-[11px]">(The Company)</h5>
            <div className="border rounded p-3 bg-white">
              <img
                src={companySignatureImg}
                alt="Company Signature"
                className="h-10 mx-auto mb-1"
              />
              <p className="text-[9px] text-muted-foreground text-center">
                Signed for and on behalf of East Side Studio London
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium">Philip Jobling</p>
              <p className="text-[9px] text-muted-foreground">Printed Name</p>
            </div>
            <div>
              <p className="text-[10px] font-medium">{formattedDate}</p>
              <p className="text-[9px] text-muted-foreground">Date</p>
            </div>
          </div>

          {/* Right: The Creative Partner */}
          <div className="space-y-3">
            <h5 className="font-bold text-[11px]">(The Creative Partner) - Signature</h5>
            <div>
              <p className="text-[10px] font-medium text-primary">{creatorName}</p>
              <p className="text-[9px] text-muted-foreground">Printed Name</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-primary">{formattedDate}</p>
              <p className="text-[9px] text-muted-foreground">Date</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium">Signature <span className="text-destructive">*</span></p>
              <div className="h-12 border rounded flex items-center justify-center bg-muted/30">
                <p className="text-[9px] text-muted-foreground">Add signature</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
