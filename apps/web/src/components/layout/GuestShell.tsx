import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

type Props = {
  brandName: string;
  brandHref?: string;
  audience: string;
  chainCode?: string;
  gatewayUrl: string;
  hero?: ReactNode;
  children: ReactNode;
  wide?: boolean;
};

export function GuestShell({
  brandName,
  brandHref = "/",
  audience,
  chainCode,
  gatewayUrl,
  hero,
  children,
  wide = false,
}: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        brandName={brandName}
        brandHref={brandHref}
        audience={audience}
        chainCode={chainCode}
      />
      {hero}
      <main
        className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 ${
          wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <div className="flex flex-col gap-8">{children}</div>
      </main>
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <SiteFooter gatewayUrl={gatewayUrl} />
      </div>
    </div>
  );
}
