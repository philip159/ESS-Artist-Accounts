import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FAQItem } from "@shared/schema";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface FAQsDropdownProps {
  faqs: FAQItem[];
  title?: string;
  lastUpdated?: string;
}

export function FAQsDropdown({ faqs, title = "FAQs", lastUpdated }: FAQsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!faqs || faqs.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover-elevate transition-colors text-left"
        data-testid="button-toggle-faqs"
      >
        <span className="text-[14px] font-medium">
          {title}{lastUpdated && <span className="text-muted-foreground font-normal"> (Last updated {lastUpdated})</span>}
        </span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 bg-background">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`} className="border-b last:border-0">
                <AccordionTrigger className="text-left text-sm py-3" data-testid={`accordion-faq-${index}`}>
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3 whitespace-pre-line">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );
}
