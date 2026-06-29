import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import type { InventorySearchHit } from "@/api/gateway";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  hits: InventorySearchHit[];
  busy: boolean;
  onSelect: (hit: InventorySearchHit) => void;
};

export function SearchResultCards({ hits, busy, onSelect }: Props) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {hits.map((hit, index) => {
        const currency = hit.pricing?.currency ?? "USD";
        return (
          <motion.li
            key={`${hit.hotel_id}-${hit.room_type_id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.25 }}
          >
            <Card className="flex h-full flex-col transition-shadow hover:shadow-xl hover:shadow-primary/5">
              <CardContent className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">
                      {hit.hotel_name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {hit.room_type_name}
                    </p>
                  </div>
                  {hit.bookable ? (
                    <Badge variant="success">Available</Badge>
                  ) : (
                    <Badge variant="destructive">Sold out</Badge>
                  )}
                </div>
                <div className="mt-auto flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {hit.nights} night{hit.nights === 1 ? "" : "s"}
                    </p>
                    <p className="font-display text-2xl font-semibold">
                      {hit.bookable && hit.pricing?.total_cents != null
                        ? formatMoney(hit.pricing.total_cents, currency)
                        : hit.bookable
                          ? "Price on request"
                          : "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={hit.bookable ? "default" : "secondary"}
                    disabled={!hit.bookable || busy}
                    onClick={() => onSelect(hit)}
                  >
                    Select
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.li>
        );
      })}
    </ul>
  );
}
