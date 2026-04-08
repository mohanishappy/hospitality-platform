import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getChainId } from "./claims";
import { problem } from "./problem";
import type { GatewayEnv, GatewayVariables } from "./types";

export const requireAuthAndChain: MiddlewareHandler<{
  Bindings: GatewayEnv;
  Variables: GatewayVariables;
}> = async (c, next) => {
  if (c.req.path === "/health") return next();
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return problem(
      401,
      "Unauthorized",
      "Missing Bearer token",
      "about:blank#missing-token"
    );
  }
  const token = auth.slice(7);
  const domain = c.env.AUTH0_DOMAIN;
  const audience = c.env.AUTH0_AUDIENCE;
  if (!domain || !audience) {
    return problem(
      500,
      "Server Misconfigured",
      "AUTH0_DOMAIN and AUTH0_AUDIENCE must be set (secrets or .dev.vars)",
      "about:blank#misconfigured"
    );
  }
  const JWKS = createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`)
  );
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${domain}/`,
      audience,
    });
    const chainId = getChainId(payload);
    if (!chainId) {
      return problem(
        403,
        "Forbidden",
        "Access token must include chain_id claim (https://hospitality.app/claims/chain_id)",
        "about:blank#missing-chain"
      );
    }
    c.set("jwt", payload);
    c.set("chainId", chainId);
  } catch {
    return problem(
      401,
      "Unauthorized",
      "Invalid or expired token",
      "about:blank#invalid-token"
    );
  }
  return next();
};
