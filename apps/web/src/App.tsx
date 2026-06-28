import { AuthBar } from "./components/AuthBar";
import { HealthPanel } from "./components/HealthPanel";
import { HotelsPanel } from "./components/HotelsPanel";
import type { AppConfig } from "./config";
import "./App.css";

type Props = {
  config: AppConfig;
};

export function App({ config }: Props) {
  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Phase 8A · hospitality-platform</p>
        <h1>Staff &amp; guest portal shell</h1>
        <p className="lede">
          Auth0 login, live gateway health, and your chain&apos;s hotel list.
        </p>
      </header>

      <AuthBar audience={config.auth0Audience} />

      <main className="grid">
        <HealthPanel gatewayUrl={config.gatewayUrl} />
        <HotelsPanel
          gatewayUrl={config.gatewayUrl}
          audience={config.auth0Audience}
        />
      </main>
    </div>
  );
}
