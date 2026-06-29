import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  DollarSign,
  Hotel,
  LayoutGrid,
  Users,
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { cn } from "@/lib/utils";
import type { EnterpriseAdminTab } from "@/lib/tenantPath";

const ADMIN_NAV: {
  id: EnterpriseAdminTab;
  label: string;
  icon: typeof Users;
}[] = [
  { id: "staff", label: "Staff", icon: Users },
  { id: "brands", label: "Brands", icon: LayoutGrid },
  { id: "properties", label: "Properties", icon: Hotel },
  { id: "rates", label: "Rates", icon: DollarSign },
  { id: "availability", label: "Availability", icon: CalendarDays },
];

type AdminNavProps = {
  enterpriseCode: string;
  tab: EnterpriseAdminTab;
  getHref: (tab: EnterpriseAdminTab) => string;
  onNavigate: (tab: EnterpriseAdminTab) => void;
};

export function AdminSidebar({
  enterpriseCode,
  tab,
  getHref,
  onNavigate,
}: AdminNavProps) {
  return (
    <nav
      className="flex flex-col gap-1"
      aria-label="Enterprise admin"
    >
      {ADMIN_NAV.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <a
            key={item.id}
            href={getHref(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(item.id);
            }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </a>
        );
      })}
      <a
        href={`/e/${encodeURIComponent(enterpriseCode)}`}
        className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <Building2 className="h-3.5 w-3.5" />
        Back to portal
      </a>
    </nav>
  );
}

type OpsShellProps = {
  brandName: string;
  brandHref?: string;
  onBrandClick?: () => void;
  audience: string;
  gatewayUrl: string;
  badge?: string;
  headerActions?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
};

export function OpsShell({
  brandName,
  brandHref,
  onBrandClick,
  audience,
  gatewayUrl,
  badge = "Admin",
  headerActions,
  sidebar,
  children,
}: OpsShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        brandName={brandName}
        brandHref={brandHref}
        audience={audience}
        badge={badge}
        actions={headerActions}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6">
        {sidebar && (
          <aside className="hidden w-52 shrink-0 md:block">
            <div className="glass-panel sticky top-24 p-3">{sidebar}</div>
          </aside>
        )}
        <main className="min-w-0 flex-1">
          <div className="flex flex-col gap-6">{children}</div>
        </main>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <SiteFooter gatewayUrl={gatewayUrl} />
      </div>
      {onBrandClick && brandHref === undefined && (
        <span className="sr-only">{brandName}</span>
      )}
    </div>
  );
}

export { ADMIN_NAV };
