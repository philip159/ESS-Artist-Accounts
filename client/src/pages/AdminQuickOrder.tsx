import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, Send, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// Map phone prefixes to ISO 2-letter country codes
const phoneToIsoCode: Record<string, string> = {
  "+44": "GB",
  "+1": "US",
  "+33": "FR",
  "+49": "DE",
  "+34": "ES",
  "+39": "IT",
  "+31": "NL",
  "+32": "BE",
  "+41": "CH",
  "+43": "AT",
  "+45": "DK",
  "+46": "SE",
  "+47": "NO",
  "+48": "PL",
  "+351": "PT",
  "+353": "IE",
  "+358": "FI",
  "+61": "AU",
  "+64": "NZ",
  "+81": "JP",
  "+82": "KR",
  "+86": "CN",
  "+91": "IN",
  "+55": "BR",
  "+52": "MX",
  "+27": "ZA",
  "+971": "AE",
  "+65": "SG",
  "+852": "HK",
};

interface ContractShipping {
  id: number;
  creatorId: string;
  title: string;
  signerName: string;
  signedAt: string;
  shipping: {
    name: string;
    firstName: string | null;
    lastName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    townCity: string | null;
    countyState: string | null;
    postcode: string | null;
    countryCode: string | null;
    phone: string | null;
    email: string | null;
  };
}

export default function AdminQuickOrder() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { toast } = useToast();
  
  // Use development URL in dev mode, production in production
  const isDev = import.meta.env.DEV;
  const externalUrl = isDev 
    ? "https://b62193a3-c4df-4566-a011-e1a65e970388-00-og1wuwui47f8.riker.replit.dev/fulfillment"
    : "https://frames.eastsidestudiolondon.co.uk/fulfillment";
  const trustedOrigin = isDev
    ? "https://b62193a3-c4df-4566-a011-e1a65e970388-00-og1wuwui47f8.riker.replit.dev"
    : "https://frames.eastsidestudiolondon.co.uk";

  const { data: contracts = [] } = useQuery<ContractShipping[]>({
    queryKey: ["/api/admin/creator-contracts/with-shipping"],
  });
  
  const handleRefresh = () => {
    setIsLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = externalUrl;
    }
  };

  const [isPushing, setIsPushing] = useState(false);

  const handlePushAddress = async () => {
    if (!selectedContractId) {
      toast({
        title: "No creator selected",
        description: "Please select a creator to push their shipping info.",
        variant: "destructive",
      });
      return;
    }

    const contract = contracts.find(c => c.id.toString() === selectedContractId);
    if (!contract) return;

    // Convert phone prefix to ISO country code
    const storedCode = contract.shipping.countryCode || "";
    const isoCountryCode = phoneToIsoCode[storedCode] || storedCode;
    
    // Format phone with country prefix if not already included
    const rawPhone = contract.shipping.phone || "";
    const fullPhone = rawPhone.startsWith("+") 
      ? rawPhone 
      : storedCode + rawPhone;

    // Generate reference: Name_Month_Year (e.g., TrevorBeers_Jan_26)
    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[now.getMonth()];
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits
    const cleanName = (contract.signerName || "Unknown").replace(/\s+/g, ""); // Remove spaces
    const reference = `${cleanName}_${month}_${year}`;

    // Format payload to match Prodigi's address requirements
    const payload = {
      name: contract.shipping.name || "",
      addressLine1: contract.shipping.addressLine1 || "",
      addressLine2: contract.shipping.addressLine2 || "",
      city: contract.shipping.townCity || "",
      postalCode: contract.shipping.postcode || "",
      countryCode: isoCountryCode, // 2-letter ISO code (e.g., "GB")
      stateOrCounty: contract.shipping.countyState || "",
      phone: fullPhone, // Full international format (e.g., "+447123456789")
      email: contract.shipping.email || "",
      merchantReference: reference, // e.g., "TrevorBeers_Jan_26"
      contractId: contract.id,
      creatorId: contract.creatorId,
    };

    setIsPushing(true);
    
    try {
      // Send to frames app webhook
      const webhookUrl = isDev 
        ? "https://b62193a3-c4df-4566-a011-e1a65e970388-00-og1wuwui47f8.riker.replit.dev/api/saved-addresses"
        : "https://frames.eastsidestudiolondon.co.uk/api/saved-addresses";
      
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to push address: ${response.statusText}`);
      }

      const result = await response.json();
      
      toast({
        title: "Address pushed successfully",
        description: `${contract.signerName}'s address is now available in Quick Order.`,
      });

      // Also try postMessage to iframe if loaded (for immediate UI update)
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "prefill", payload }, trustedOrigin);
      }
    } catch (error) {
      console.error("Failed to push address:", error);
      toast({
        title: "Failed to push address",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPushing(false);
    }
  };

  const selectedContract = contracts.find(c => c.id.toString() === selectedContractId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Quick Order</h1>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedContractId} onValueChange={setSelectedContractId}>
            <SelectTrigger className="w-[280px]" data-testid="select-creator">
              <SelectValue placeholder="Select a creator..." />
            </SelectTrigger>
            <SelectContent>
              {contracts.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">
                  No signed contracts with shipping info
                </div>
              ) : (
                contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id.toString()}>
                    {contract.signerName} - {contract.title}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          
          <Button 
            variant="default"
            size="sm"
            onClick={handlePushAddress}
            disabled={!selectedContractId || isPushing}
            data-testid="button-push-address"
          >
            {isPushing ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {isPushing ? "Pushing..." : "Push Address"}
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            data-testid="button-refresh-iframe"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            asChild
            data-testid="button-open-external"
          >
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in New Tab
            </a>
          </Button>
        </div>
      </div>

      {selectedContract && (
        <div className="p-4 border-b bg-muted/30">
          <div className="text-sm">
            <span className="font-medium">Selected: </span>
            <span className="text-muted-foreground">
              {selectedContract.shipping.name}
              {selectedContract.shipping.addressLine1 && ` • ${selectedContract.shipping.addressLine1}`}
              {selectedContract.shipping.townCity && `, ${selectedContract.shipping.townCity}`}
              {selectedContract.shipping.postcode && ` ${selectedContract.shipping.postcode}`}
              {selectedContract.shipping.phone && ` • ${selectedContract.shipping.phone}`}
            </span>
          </div>
        </div>
      )}
      
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading Quick Order...</p>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={externalUrl}
          className="w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
          title="Prodigi Quick Order"
          data-testid="iframe-quick-order"
        />
      </div>
    </div>
  );
}
