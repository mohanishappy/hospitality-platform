import { motion } from "framer-motion";
import { ArrowUpRight, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchEnterpriseChains,
  fetchEnterprises,
  type ChainSummary,
  type EnterpriseSummary,
} from "../api/gateway";
import { chainPath, enterprisePath } from "../lib/tenantPath";
import type { AppConfig } from "../config";
import { GuestShell } from "./layout/GuestShell";
import { HeroBand } from "./layout/PageHeader";
import { CardGridSkeleton } from "./shared/LoadingBlock";
import { ErrorAlert } from "./shared/ErrorAlert";
import { EmptyState } from "./shared/EmptyState";
import { Card, CardContent } from "./ui/card";

type Props = {
  config: AppConfig;
};

type EnterpriseGroup = {
  enterprise: EnterpriseSummary;
  chains: ChainSummary[];
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; groups: EnterpriseGroup[] }
  | { kind: "error"; message: string };

export function HomePage({ config }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const entData = await fetchEnterprises(config.gatewayUrl);
        const enterprises = entData.enterprises ?? [];
        const groups = await Promise.all(
          enterprises.map(async (enterprise) => {
            const chainData = await fetchEnterpriseChains(
              config.gatewayUrl,
              enterprise.code
            );
            return {
              enterprise,
              chains: chainData.chains ?? [],
            };
          })
        );
        if (!cancelled) setState({ kind: "ok", groups });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to load",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.gatewayUrl]);

  const totalBrands =
    state.kind === "ok"
      ? state.groups.reduce((n, g) => n + g.chains.length, 0)
      : 0;

  return (
    <GuestShell
      brandName="Book a stay"
      audience={config.auth0Audience}
      gatewayUrl={config.gatewayUrl}
      wide
      hero={
        <HeroBand
          title="Where would you like to stay?"
          description="Browse hotel groups and brands to check availability and reserve your room."
        />
      }
    >
      {state.kind === "loading" && <CardGridSkeleton count={6} />}

      {state.kind === "error" && <ErrorAlert message={state.message} />}

      {state.kind === "ok" && state.groups.length === 0 && (
        <EmptyState
          title="No properties available"
          description="Check back soon — new hotel groups are added regularly."
        />
      )}

      {state.kind === "ok" && state.groups.length > 0 && (
        <div className="space-y-10">
          {state.groups.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid gap-4 lg:grid-cols-3"
            >
              <Card className="relative overflow-hidden lg:col-span-2 lg:row-span-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent" />
                <CardContent className="relative flex h-full min-h-[220px] flex-col justify-end p-8">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    Featured
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-semibold">
                    {state.groups[0]!.enterprise.name}
                  </h2>
                  <p className="mt-2 max-w-md text-muted-foreground">
                    {state.groups[0]!.chains.length} brand
                    {state.groups[0]!.chains.length === 1 ? "" : "s"} · Direct
                    booking, no middleman
                  </p>
                  <a
                    href={enterprisePath(state.groups[0]!.enterprise.code)}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Explore enterprise
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex h-full flex-col justify-center p-6">
                  <p className="text-4xl font-display font-semibold">{totalBrands}</p>
                  <p className="text-sm text-muted-foreground">Brands to explore</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex h-full flex-col justify-center p-6">
                  <Building2 className="h-8 w-8 text-primary" />
                  <p className="mt-2 font-display text-lg font-semibold">
                    {state.groups.length} enterprise
                    {state.groups.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Hotel groups on the platform
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state.groups.map((group, gi) => (
            <section key={group.enterprise.id} className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-semibold">
                    <a
                      href={enterprisePath(group.enterprise.code)}
                      className="hover:text-primary"
                    >
                      {group.enterprise.name}
                    </a>
                  </h2>
                </div>
                <a
                  href={enterprisePath(group.enterprise.code)}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Enterprise hub →
                </a>
              </div>

              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.chains.map((chain, ci) => (
                  <motion.li
                    key={chain.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: gi * 0.05 + ci * 0.03 }}
                  >
                    <a
                      href={chainPath(chain.code)}
                      className="group flex h-full flex-col rounded-xl border border-border/80 bg-card p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                    >
                      <strong className="font-display text-lg font-semibold group-hover:text-primary">
                        {chain.name}
                      </strong>
                      <span className="mt-auto pt-4 flex items-center gap-1 text-sm text-muted-foreground">
                        View availability
                        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </span>
                    </a>
                  </motion.li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </GuestShell>
  );
}
