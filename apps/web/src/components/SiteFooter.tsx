import { HealthPanel } from "./HealthPanel";
import { Separator } from "./ui/separator";

type Props = {
  gatewayUrl: string;
};

export function SiteFooter({ gatewayUrl }: Props) {
  return (
    <footer className="space-y-4 pt-4">
      <Separator />
      <HealthPanel gatewayUrl={gatewayUrl} compact />
    </footer>
  );
}
