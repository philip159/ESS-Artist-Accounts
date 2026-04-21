import { Check } from "lucide-react";

interface Step {
  label: string;
  status: "completed" | "current" | "upcoming";
}

interface ProgressStepperProps {
  steps: Step[];
}

export function ProgressStepper({ steps }: ProgressStepperProps) {
  return (
    <div className="w-full max-w-3xl mx-auto py-4 sm:py-8 px-6 sm:px-4" data-testid="progress-stepper">
      <div className="flex items-center">
        {steps.map((step, index) => (
          <div key={`step-${index}`} className="flex items-center flex-1 last:flex-none">
            {/* Step - fixed width container */}
            <div className="flex flex-col items-center flex-none w-16 sm:w-24">
              {/* Step Circle */}
              <div className="relative">
                {step.status === "completed" && (
                  <div 
                    className="w-5 h-5 sm:w-8 sm:h-8 rounded-full bg-primary flex items-center justify-center"
                    data-testid={`step-${index}-completed`}
                  >
                    <Check className="w-3 h-3 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                )}
                {step.status === "current" && (
                  <div 
                    className="relative w-5 h-5 sm:w-8 sm:h-8 rounded-full border-2 border-primary"
                    data-testid={`step-${index}-current`}
                  >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 sm:w-3 sm:h-3 rounded-full bg-primary" />
                  </div>
                )}
                {step.status === "upcoming" && (
                  <div 
                    className="w-5 h-5 sm:w-8 sm:h-8 rounded-full border-2 border-muted-foreground/30"
                    data-testid={`step-${index}-upcoming`}
                  />
                )}
              </div>
              
              {/* Step Label - hidden on mobile */}
              <span 
                className={`hidden sm:block mt-2 text-sm text-center ${
                  step.status === "current" 
                    ? "text-foreground font-medium" 
                    : step.status === "completed"
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60"
                }`}
                data-testid={`step-${index}-label`}
              >
                {step.label}
              </span>
            </div>
            
            {/* Connecting Line - flexible width */}
            {index < steps.length - 1 && (
              <div 
                className={`h-0.5 flex-1 -mt-5 sm:-mt-7 ${
                  step.status === "completed" 
                    ? "bg-primary" 
                    : "bg-muted-foreground/30"
                }`}
                data-testid={`connector-${index}`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
