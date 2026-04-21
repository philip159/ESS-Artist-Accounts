/**
 * Single source of truth for all contract sections.
 * Both the admin preview (FormalContractPreview) and public contract (CreatorContract)
 * use this to ensure they always stay in sync.
 */

export interface ContractSection {
  id: string;
  title: string;
  defaultContent: string;
  isConditional?: boolean; // If true, section only appears when a condition is met (e.g., exclusivity)
  isEditable?: boolean; // If true, content can be customized per contract
  isLegalTerm?: boolean; // If true, this is a standard legal term section
}

// Custom sections that can be edited per contract
export const editableSections: ContractSection[] = [
  {
    id: "scopeOfWork",
    title: "SCOPE OF WORK",
    defaultContent: "",
    isEditable: true,
  },
  {
    id: "compensation",
    title: "COMPENSATION",
    defaultContent: "",
    isEditable: true,
  },
  {
    id: "usageRights",
    title: "USAGE RIGHTS",
    defaultContent: "",
    isEditable: true,
  },
  {
    id: "exclusivity",
    title: "EXCLUSIVITY",
    defaultContent: "",
    isConditional: true,
    isEditable: true,
  },
  {
    id: "schedule",
    title: "SCHEDULE & DEADLINES",
    defaultContent: "",
    isEditable: true,
  },
];

// Legal terms with default content - these are standard across all contracts
export const legalSections: ContractSection[] = [
  {
    id: "legalCompliance",
    title: "LEGAL COMPLIANCE & DISCLOSURES",
    defaultContent: `Creative Partner shall comply with all applicable advertising and consumer-protection laws, regulations and codes, including but not limited to the ASA/CAP Code (UK), CMA guidelines, FTC Guides (US), EU UCPD and any equivalent local rules. Disclosures must be clear and prominent.`,
    isLegalTerm: true,
  },
  {
    id: "morality",
    title: "MORALITY & BRAND SAFETY",
    defaultContent: `Creative Partner shall not post or engage in offensive, discriminatory, hateful, illegal, or NSFW conduct, nor publicly disparage the Brand or its products.`,
    isLegalTerm: true,
  },
  {
    id: "independentContractor",
    title: "INDEPENDENT CONTRACTOR & TAXES",
    defaultContent: `Creative Partner acts solely as an independent contractor. Nothing herein creates an employment, agency, partnership or joint-venture relationship. Creative Partner is responsible for all income, social-security and other taxes.`,
    isLegalTerm: true,
  },
  {
    id: "forceMajeure",
    title: "FORCE MAJEURE & PLATFORM OUTAGE",
    defaultContent: `Neither Party is liable for delay or non-performance caused by events beyond reasonable control (e.g. natural disaster, war, pandemic, or prolonged platform outage).`,
    isLegalTerm: true,
  },
  {
    id: "disputeResolution",
    title: "DISPUTE RESOLUTION",
    defaultContent: `The Parties will attempt in good faith to resolve disputes by mediation. Failing settlement within 30 days, the courts of England & Wales have exclusive jurisdiction and English law governs.`,
    isLegalTerm: true,
  },
  {
    id: "takedown",
    title: "TAKEDOWN & CONTENT REMOVAL",
    defaultContent: `Brand may require Creative Partner to edit or remove sponsored content if it becomes misleading, infringes IP, breaches disclosure rules, or poses brand-safety concerns. Creative Partner must comply within 48 hours.`,
    isLegalTerm: true,
  },
  {
    id: "termination",
    title: "TERMINATION & NON-DELIVERY",
    defaultContent: `Before shipment: Brand may cancel for any reason without liability. After shipment: If Creative Partner misses the posting deadline by more than 7 days or materially breaches this Agreement, Brand may terminate, reclaim the product (or its cost) and withhold payment.`,
    isLegalTerm: true,
  },
  {
    id: "indemnity",
    title: "MUTUAL INDEMNITY",
    defaultContent: `Creative Partner indemnifies Brand against third-party claims, fines or damages arising from Creative Partner's breach of law, disclosure rules, IP infringement or negligent/wilful acts. Brand indemnifies Creative Partner against claims that the Brand's artwork or materials infringe third-party IP.`,
    isLegalTerm: true,
  },
  {
    id: "confidentiality",
    title: "CONFIDENTIALITY",
    defaultContent: `All non-public information relating to this collaboration, including compensation, campaign strategy or business operations, is confidential for three (3) years, unless required by law or mutual written consent.`,
    isLegalTerm: true,
  },
  {
    id: "dataProtection",
    title: "DATA PROTECTION & PRIVACY",
    defaultContent: `If either Party processes personal data in connection with this Agreement, it shall comply with all applicable data-protection laws (e.g. UK GDPR, EU GDPR, CCPA). No personal data will be shared beyond what is necessary for fulfilment of this Agreement.`,
    isLegalTerm: true,
  },
  {
    id: "insurance",
    title: "INSURANCE",
    defaultContent: `If requested in writing by Brand, Creative Partner shall maintain adequate professional-liability and general-commercial-liability insurance covering the services provided hereunder.`,
    isLegalTerm: true,
  },
  {
    id: "language",
    title: "LANGUAGE & INTERPRETATION",
    defaultContent: `This Agreement is executed in English. Any translation is for convenience only; the English version prevails in the event of conflict.`,
    isLegalTerm: true,
  },
  {
    id: "boilerplate",
    title: "BOILERPLATE",
    defaultContent: `Entire Agreement: This document supersedes all prior discussions.
Amendments: Changes valid only if in a signed writing (email signature acceptable).
Severability: If any clause is invalid, the remainder remains in force.
Notice: Formal notices by email to
Brand: philip@eastsidestudiolondon.co.uk
Creative Partner: {{CREATOR_EMAIL}}
Assignment: Neither Party may assign this Agreement without written consent (except Brand within its corporate group).
No Partnership: Nothing herein creates a partnership, joint venture or agency relationship between the Parties.`,
    isLegalTerm: true,
  },
];

// Helper to get section number based on whether exclusivity is enabled
export function getSectionNumber(
  sectionId: string,
  exclusivityEnabled: boolean
): number {
  const allSections = getAllSections(exclusivityEnabled);
  const index = allSections.findIndex((s) => s.id === sectionId);
  return index + 1;
}

// Get all sections in order, optionally excluding exclusivity
export function getAllSections(exclusivityEnabled: boolean): ContractSection[] {
  const sections = [...editableSections];
  
  // Filter out exclusivity if not enabled
  const filteredSections = exclusivityEnabled 
    ? sections 
    : sections.filter(s => s.id !== "exclusivity");
  
  return [...filteredSections, ...legalSections];
}

// Get just the legal sections with proper numbering
export function getLegalSectionsWithNumbers(exclusivityEnabled: boolean): Array<ContractSection & { number: number }> {
  const baseNumber = exclusivityEnabled ? 6 : 5; // Legal sections start after editable ones
  
  return legalSections.map((section, index) => ({
    ...section,
    number: baseNumber + index,
  }));
}

// Get default legal terms as a key-value object (for backwards compatibility)
export function getDefaultLegalTerms(): Record<string, string> {
  const terms: Record<string, string> = {};
  for (const section of legalSections) {
    terms[section.id] = section.defaultContent;
  }
  return terms;
}

// Replace placeholder variables in content
export function replaceContractVariables(
  content: string,
  variables: {
    creatorEmail?: string;
    creatorName?: string;
    creatorAddress?: string;
    contractDate?: string;
  }
): string {
  let result = content;
  
  if (variables.creatorEmail) {
    result = result.replace(/\{\{CREATOR_EMAIL\}\}/g, variables.creatorEmail);
  }
  if (variables.creatorName) {
    result = result.replace(/\{\{CREATOR_NAME\}\}/g, variables.creatorName);
  }
  if (variables.creatorAddress) {
    result = result.replace(/\{\{CREATOR_ADDRESS\}\}/g, variables.creatorAddress);
  }
  if (variables.contractDate) {
    result = result.replace(/\{\{CONTRACT_DATE\}\}/g, variables.contractDate);
  }
  
  return result;
}
