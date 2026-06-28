import type { JWTPayload } from "jose";

export type GatewayEnv = {
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  /** Shared secret for internal staff claims route (Auth0 Action). */
  ACTION_CLAIMS_SECRET?: string;
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
  /** All chains in the user's enterprise (from JWT). */
  chainIds?: string[];
  enterpriseId?: string;
  /** Parsed roles claim; `null` when claim absent (legacy full access). */
  roles?: string[] | null;
  /** Lowercased login email for guest-scoped reservation access. */
  userEmail?: string;
  /** Anonymous booking via `x-chain-code` (guest permissions only). */
  isPublicBooking?: boolean;
};
