export type AppConfig = {
  gatewayUrl: string;
  auth0Domain: string;
  auth0ClientId: string;
  auth0Audience: string;
};

function requireEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy apps/web/.env.example to apps/web/.env and fill in values.`);
  }
  return value.replace(/\/+$/, "");
}

export function loadConfig(): AppConfig {
  return {
    gatewayUrl: requireEnv("VITE_GATEWAY_URL"),
    auth0Domain: requireEnv("VITE_AUTH0_DOMAIN"),
    auth0ClientId: requireEnv("VITE_AUTH0_CLIENT_ID"),
    auth0Audience: requireEnv("VITE_AUTH0_AUDIENCE"),
  };
}
