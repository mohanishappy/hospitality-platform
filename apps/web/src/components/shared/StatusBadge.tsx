import type { ReservationDetail } from "@/api/gateway";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({
  status,
}: {
  status: ReservationDetail["status"];
}) {
  const variant =
    status === "confirmed"
      ? "success"
      : status === "cancelled"
        ? "destructive"
        : "warning";

  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}
