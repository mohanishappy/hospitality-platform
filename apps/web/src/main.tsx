import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { App } from "./App";
import { loadConfig } from "./config";
import "./index.css";

const config = loadConfig();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Auth0Provider
      domain={config.auth0Domain}
      clientId={config.auth0ClientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: config.auth0Audience,
      }}
      cacheLocation="localstorage"
    >
      <App config={config} />
    </Auth0Provider>
  </StrictMode>
);
