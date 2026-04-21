import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle, Mail } from "lucide-react";

const FAQ_SECTIONS = [
  {
    title: "Getting Started",
    items: [
      {
        question: "How do I submit new artwork?",
        answer:
          "Navigate to 'Artwork Upload' in the sidebar. You can drag and drop your files or click 'Browse Files'. We accept JPEG and PNG files at a minimum of 150 DPI. Once uploaded, our team will review your submission and get in touch.",
      },
      {
        question: "What file formats do you accept?",
        answer:
          "We accept JPEG and PNG files. Your artwork should be at least 150 DPI for the smallest print sizes. Higher resolution files unlock larger available print sizes. The maximum file size is 300 MB per image.",
      },
      {
        question: "How long does the review process take?",
        answer:
          "Our team typically reviews submissions within 5–10 working days. You'll receive an email notification when your artwork has been processed. You can also track the status in the 'My Collection' section.",
      },
    ],
  },
  {
    title: "Commissions & Payments",
    items: [
      {
        question: "How are commissions calculated?",
        answer:
          "You earn 50% of the net sale price on each print sold. Net price is calculated after deductions such as payment processing fees, taxes, and any applicable discounts. You can view a full breakdown in the Commissions section.",
      },
      {
        question: "When are payments made?",
        answer:
          "Payments are processed monthly, typically within the first two weeks of each month for the previous month's sales. You must have a valid PayPal email address set in your Settings to receive payments.",
      },
      {
        question: "How do I set up my payment details?",
        answer:
          "Go to Settings and enter your PayPal email address and recipient name. Make sure these details exactly match your PayPal account to avoid payment delays.",
      },
      {
        question: "What is the minimum payout threshold?",
        answer:
          "Payments are issued for any balance above £10. If your balance is below this threshold, it will roll over to the following month.",
      },
    ],
  },
  {
    title: "Your Collection",
    items: [
      {
        question: "How do I know when my artwork is live?",
        answer:
          "Once your artwork passes review, it is listed in our Shopify store and will appear in your 'My Collection' page as a live product. You'll also receive an email notification when it goes live.",
      },
      {
        question: "Can I update or remove an artwork from the store?",
        answer:
          "Please contact us directly at artists@eastsidestudiolondon.co.uk if you need to update or remove any artwork from the store. We'll handle the changes on our end.",
      },
      {
        question: "What print sizes will my artwork be available in?",
        answer:
          "The available print sizes depend on the resolution of your submitted file. Higher resolution images can be printed at larger sizes. You can see the maximum print size during the upload process.",
      },
    ],
  },
  {
    title: "Exclusivity & Rights",
    items: [
      {
        question: "Is my agreement with East Side Studio exclusive?",
        answer:
          "Unless otherwise agreed in writing, our standard partnership is exclusive — meaning while your artwork is listed with us, it should not be available through competing print-on-demand platforms. Please refer to your contract for full details.",
      },
      {
        question: "Who retains copyright of my artwork?",
        answer:
          "You retain full copyright of all artwork you submit. You grant us a licence to reproduce and sell prints of your work under the agreed terms. We do not claim ownership of your intellectual property.",
      },
    ],
  },
];

export default function ArtistFAQs() {
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900" data-testid="text-page-title">
          FAQs
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Answers to common questions about your artist account
        </p>
      </div>

      <div className="space-y-6">
        {FAQ_SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {section.items.map((item, idx) => (
                  <AccordionItem key={idx} value={`${section.title}-${idx}`}>
                    <AccordionTrigger className="text-left text-sm font-medium">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-stone-50 border-stone-200">
        <CardContent className="py-6 flex items-start gap-4">
          <div className="p-2 bg-stone-200 rounded-full mt-0.5">
            <Mail className="h-4 w-4 text-stone-600" />
          </div>
          <div>
            <p className="font-medium text-stone-800">Still have questions?</p>
            <p className="text-sm text-stone-600 mt-1">
              Reach us at{" "}
              <a
                href="mailto:artists@eastsidestudiolondon.co.uk"
                className="underline hover:text-stone-900"
              >
                artists@eastsidestudiolondon.co.uk
              </a>{" "}
              and we'll get back to you as soon as possible.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
