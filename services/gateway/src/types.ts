import type { JWTPayload } from "jose";

export type GatewayEnv = {
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  INVENTORY: Fetcher;
  RESERVATIONS: Fetcher;
};

export type GatewayVariables = {
  requestId: string;
  jwt?: JWTPayload;
  chainId?: string;
};
