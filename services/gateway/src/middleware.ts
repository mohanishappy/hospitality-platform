import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  enforcePublicBookingAuthorization,
  enforceRouteAuthorization,
} from "./authorization";
import {
  getChainId,
  getChainIds,
  getEnterpriseId,
  getOAuthClientId,
  getRoles,
  getSubject,
  getUserEmail,
  isM2mToken,
  isStaffUser,
} from "./claims";
import {
  pickActiveChainId,
  resolveChainScope,
  staffScopeForbiddenDetail,
} from "./chain-scope";
import {
  fetchEnterpriseChainsById,
  resolveChainByCode,
} from "./inventory-client";
import { fetchStaffAccess } from "./staff-access";
import { problem } from "./problem";
import {
  isPublicBookingRoute,
  isPublicChainCatalogRoute,
  readChainCode,
} from "./public-booking";
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
    const chainIdsClaim = getChainIds(payload);
    const enterpriseId = getEnterpriseId(payload);
    const roles = getRoles(payload);

    let chainIds: string[] = [];
    let staffAccess = null;
    if (enterpriseId) {
      const enterpriseChains = await fetchEnterpriseChainsById(
        c.env,
        enterpriseId
      );
      if (enterpriseChains.length === 0) {
        return problem(
          403,
          "Forbidden",
          "Enterprise has no brands or enterprise_id is invalid",
          "about:blank#unknown-enterprise"
        );
      }

      if (isStaffUser(roles)) {
        staffAccess = await fetchStaffAccess(c.env, enterpriseId, {
          auth0Sub: getSubject(payload),
          clientId: isM2mToken(payload) ? getOAuthClientId(payload) : null,
        });
      }

      chainIds = resolveChainScope(enterpriseChains, roles, staffAccess);
    } else if (chainIdsClaim?.length) {
      chainIds = chainIdsClaim;
    } else if (chainId) {
      chainIds = [chainId];
    }

    if (chainIds.length === 0) {
      return problem(
        403,
        "Forbidden",
        enterpriseId
          ? staffScopeForbiddenDetail(roles, staffAccess)
          : "Access token must include enterprise_id or chain_id claim",
        "about:blank#missing-chain"
      );
    }

    const chainCode = readChainCode(c);
    const resolvedFromCode = chainCode
      ? await resolveChainByCode(c.env, chainCode)
      : null;
    const activeChainId = pickActiveChainId(
      chainIds,
      chainId,
      resolvedFromCode
    );

    c.set("jwt", payload);
    c.set("chainId", activeChainId);
    c.set("chainIds", chainIds);
    if (enterpriseId) c.set("enterpriseId", enterpriseId);
    const userEmail = getUserEmail(payload);
    if (userEmail) c.set("userEmail", userEmail);
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
