import type { JWTPayload } from "jose";

export type GatewayEnv = {
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  /** Optional: when set, `/health/ready` pings PostgREST (inventory.chain). */
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Optional: Workers Analytics Engine dataset (Phase 7D). */
  ANALYTICS?: AnalyticsEngineDataset;
  INVENTORY: Fetcher;
  RESERVATIONS: Fetcher;
};

export type GatewayVariables = {
  requestId: string;
  jwt?: JWTPayload;
  chainId?: string;
  /** Parsed roles claim; `null` when claim absent (legacy full access). */
  roles?: string[] | null;
};
