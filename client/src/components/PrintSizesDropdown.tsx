import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PRINT_SIZES, type FormCopy } from "@shared/schema";

interface PrintSizesDropdownProps {
  copy?: Partial<FormCopy>;
}

interface SizesByRatio {
  ratio: string;
  sizes: Array<{
    code: string;
    name: string;
    widthIn: number;
    heightIn: number;
    widthCm: number;
    heightCm: number;
  }>;
}

function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54);
}

function getRatioCategory(ratio: number): string {
  const tolerance = 0.02;
  
  if (Math.abs(ratio - 1) < tolerance) return "square";
  if (Math.abs(ratio - 0.707) < tolerance || Math.abs(ratio - 1.414) < tolerance) return "a-ratio";
  if (Math.abs(ratio - 0.75) < tolerance || Math.abs(ratio - 1.333) < tolerance) return "3:4";
  if (Math.abs(ratio - 0.667) < tolerance || Math.abs(ratio - 1.5) < tolerance) return "2:3";
  if (Math.abs(ratio - 0.8) < tolerance || Math.abs(ratio - 1.25) < tolerance) return "4:5";
  if (Math.abs(ratio - 0.625) < tolerance || Math.abs(ratio - 1.6) < tolerance) return "5:8";
  
  return "other";
}

function organizeSizesByRatio(): SizesByRatio[] {
  const ratioGroups: Record<string, SizesByRatio> = {
    "a-ratio": { ratio: "A Ratio", sizes: [] },
    "square": { ratio: "Square", sizes: [] },
    "3:4": { ratio: "3:4", sizes: [] },
    "2:3": { ratio: "2:3", sizes: [] },
    "4:5": { ratio: "4:5", sizes: [] },
    "5:8": { ratio: "5:8", sizes: [] },
  };

  PRINT_SIZES.forEach((size) => {
    const ratio = size.widthIn / size.heightIn;
    const category = getRatioCategory(ratio);
    
    if (ratioGroups[category]) {
      ratioGroups[category].sizes.push({
        ...size,
        widthCm: inchesToCm(size.widthIn),
        heightCm: inchesToCm(size.heightIn),
      });
    }
  });

  Object.values(ratioGroups).forEach(group => {
    group.sizes.sort((a, b) => (a.widthIn * a.heightIn) - (b.widthIn * b.heightIn));
  });

  return Object.values(ratioGroups).filter(group => group.sizes.length > 0);
}

export function PrintSizesDropdown({ copy }: PrintSizesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showInches, setShowInches] = useState(true);
  const sizesByRatio = organizeSizesByRatio();

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover-elevate transition-colors text-left"
        data-testid="button-toggle-print-sizes"
      >
        <span className="text-[14px] font-medium">{copy?.printSizesTitle || "Available Print Sizes"}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 space-y-6 bg-background">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {copy?.printSizesHelpText || "Your artwork's aspect ratio determines which print sizes are available."}
            </p>
            <div className="flex items-center gap-1 text-sm border rounded-full overflow-hidden flex-shrink-0 ml-4">
              <button
                type="button"
                onClick={() => setShowInches(true)}
                className={`px-3 py-1 transition-colors ${
                  showInches 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover-elevate'
                }`}
                data-testid="button-toggle-inches"
              >
                in
              </button>
              <button
                type="button"
                onClick={() => setShowInches(false)}
                className={`px-3 py-1 transition-colors ${
                  !showInches 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover-elevate'
                }`}
                data-testid="button-toggle-cm"
              >
                cm
              </button>
            </div>
          </div>

          {sizesByRatio.map((group) => (
            <div key={group.ratio} className="space-y-2">
              <h4 className="font-semibold text-sm">{group.ratio}</h4>
              
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Size</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">
                        {showInches ? "Dimensions" : "Dimensions"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.sizes.map((size) => (
                      <tr key={size.code} className="border-b border-muted/50 last:border-0">
                        <td className="py-2 pr-4 font-medium">{size.name}</td>
                        <td className="py-2 text-muted-foreground">
                          {showInches 
                            ? `${size.widthIn}" x ${size.heightIn}"`
                            : `${size.widthCm}cm x ${size.heightCm}cm`
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
