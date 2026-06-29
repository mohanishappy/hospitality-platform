import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "@/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import { AuthBar } from "@/components/AuthBar";
import { cn } from "@/lib/utils";

type Props = {
  brandName: string;
  brandHref?: string;
  audience: string;
  chainCode?: string;
  badge?: string;
  actions?: ReactNode;
  sticky?: boolean;
};

export function SiteHeader({
  brandName,
  brandHref = "/",
  audience,
  chainCode,
  badge,
  actions,
  sticky = true,
}: Props) {
  const { resolved, toggleTheme } = useTheme();

  return (
    <header
      className={cn(
        "z-40 border-b border-border/60 bg-glass/80 backdrop-blur-xl",
        sticky && "sticky top-0"
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={brandHref}
            className="font-display truncate text-xl font-semibold tracking-tight text-foreground hover:opacity-80"
          >
            {brandName}
          </a>
          {badge && (
            <span className="rounded-full border border-border bg-secondary/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {resolved === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <AuthBar audience={audience} chainCode={chainCode} />
        </div>
      </div>
    </header>
  );
}
