import { HealthPanel } from "./HealthPanel";

type Props = {
  gatewayUrl: string;
};

export function SiteFooter({ gatewayUrl }: Props) {
  return (
    <footer className="site-footer">
      <HealthPanel gatewayUrl={gatewayUrl} compact />
    </footer>
  );
}
