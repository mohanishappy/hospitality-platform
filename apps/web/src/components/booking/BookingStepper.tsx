import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "search", label: "Search" },
  { id: "results", label: "Rooms" },
  { id: "book", label: "Checkout" },
  { id: "done", label: "Confirmed" },
] as const;

export type BookingStepId = (typeof STEPS)[number]["id"];

export function BookingStepper({ current }: { current: BookingStepId }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-0">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.id} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                done && "text-primary",
                active && "bg-primary/15 text-primary",
                !done && !active && "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-xs",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary/20",
                  !done && !active && "border-border"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-1 hidden h-px w-6 sm:block md:w-10",
                  index < currentIndex ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function stepFromPhase(
  phase: "search" | "results" | "book" | "done"
): BookingStepId {
  return phase;
}
