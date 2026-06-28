import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { loadConfig } from "./config";
import "./index.css";

const config = loadConfig();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Auth0Provider
        domain={config.auth0Domain}
        clientId={config.auth0ClientId}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: config.auth0Audience,
          scope: "openid profile email",
        }}
        cacheLocation="localstorage"
        useRefreshTokensFallback
        onRedirectCallback={(appState) => {
          const target = appState?.returnTo ?? window.location.pathname;
          window.history.replaceState({}, document.title, target);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
      >
        <App config={config} />
      </Auth0Provider>
    </ErrorBoundary>
  </StrictMode>
);
