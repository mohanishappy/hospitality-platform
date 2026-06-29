import type { AvailabilityQuote, InventorySearchHit } from "@/api/gateway";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Props = {
  hit?: InventorySearchHit;
  quote?: AvailabilityQuote;
  checkIn?: string;
  checkOut?: string;
  className?: string;
};

export function TripSummary({ hit, quote, checkIn, checkOut, className }: Props) {
  const pricing = quote?.pricing;
  const currency = pricing?.currency ?? hit?.pricing?.currency ?? "USD";
  const total =
    pricing?.total_cents ?? hit?.pricing?.total_cents ?? undefined;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Trip summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {hit && (
          <>
            <div>
              <p className="font-semibold">{hit.hotel_name}</p>
              <p className="text-muted-foreground">{hit.room_type_name}</p>
            </div>
            <Separator />
          </>
        )}
        {(checkIn || hit?.check_in) && (checkOut || hit?.check_out) && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Dates</span>
            <span className="text-right font-medium">
              {checkIn ?? hit?.check_in} → {checkOut ?? hit?.check_out}
            </span>
          </div>
        )}
        {hit?.nights != null && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Nights</span>
            <span>{hit.nights}</span>
          </div>
        )}
        {pricing?.rate_plan_code && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Rate plan</span>
            <span>{pricing.rate_plan_code}</span>
          </div>
        )}
        {total != null && (
          <>
            <Separator />
            <div className="flex justify-between gap-2 font-display text-lg font-semibold">
              <span>Total</span>
              <span>{formatMoney(total, currency)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
