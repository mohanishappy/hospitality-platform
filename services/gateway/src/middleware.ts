import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  enforcePublicBookingAuthorization,
  enforceRouteAuthorization,
} from "./authorization";
import { getChainId, getRoles, getUserEmail } from "./claims";
import { problem } from "./problem";
import {
  isPublicBookingRoute,
  isPublicChainCatalogRoute,
  readChainCode,
} from "./public-booking";
import { resolveChainByCode } from "./resolve-chain";
import type { GatewayEnv, GatewayVariables } from "./types";

export const requireAuthAndChain: MiddlewareHandler<{
  Bindings: GatewayEnv;
  Variables: GatewayVariables;
}> = async (c, next) => {
  const p = c.req.path;
  if (
    p === "/health" ||
    p === "/health/ready" ||
    p === "/openapi.json" ||
    p === "/docs"
  ) {
    return next();
  }

  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    if (!isPublicBookingRoute(c.req.method, p)) {
      return problem(
        401,
        "Unauthorized",
        "Missing Bearer token",
        "about:blank#missing-token"
      );
    }

    c.set("isPublicBooking", true);
    c.set("roles", ["guest"]);

    if (!isPublicChainCatalogRoute(c.req.method, p)) {
      const chainCode = readChainCode(c);
      if (!chainCode) {
        return problem(
          400,
          "Bad Request",
          "Missing x-chain-code header for public booking",
          "about:blank#missing-chain-code"
        );
      }
      const chain = await resolveChainByCode(c.env, chainCode);
      if (!chain) {
        return problem(
          404,
          "Not Found",
          `Unknown chain code: ${chainCode}`,
          "about:blank#unknown-chain"
        );
      }
      c.set("chainId", chain.id);
    }

    const denied = await enforcePublicBookingAuthorization(c);
    if (denied) return denied;
    return next();
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
    const userEmail = getUserEmail(payload);
    if (userEmail) c.set("userEmail", userEmail);
    const roles = getRoles(payload);
    c.set("roles", roles);
  } catch {
    return problem(
      401,
      "Unauthorized",
      "Invalid or expired token",
      "about:blank#invalid-token"
    );
  }
  const denied = await enforceRouteAuthorization(c);
  if (denied) {
    return denied;
  }
  return next();
};
