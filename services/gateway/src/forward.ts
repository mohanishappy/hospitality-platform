import type { Context } from "hono";
import type { GatewayEnv, GatewayVariables } from "./types";

export async function forward(
  c: Context<{ Bindings: GatewayEnv; Variables: GatewayVariables }>,
  binding: Fetcher
): Promise<Response> {
  const url = new URL(c.req.url);
  const target = new URL(url.pathname + url.search, "https://internal");
  const headers = new Headers(c.req.raw.headers);
  const chainId = c.get("chainId");
  if (chainId) headers.set("x-chain-id", chainId);
  const chainIds = c.get("chainIds");
  if (chainIds?.length) headers.set("x-chain-ids", chainIds.join(","));
  const enterpriseId = c.get("enterpriseId");
  if (enterpriseId) headers.set("x-enterprise-id", enterpriseId);
  const roles = c.get("roles");
  if (roles !== undefined && roles !== null) {
    headers.set("x-roles", roles.join(","));
  }
  const userEmail = c.get("userEmail");
  if (userEmail) headers.set("x-user-email", userEmail);
  const jwt = c.get("jwt");
  if (jwt && typeof jwt.sub === "string" && jwt.sub.trim()) {
    headers.set("x-auth0-sub", jwt.sub.trim());
  }
  const requestId = c.get("requestId");
  if (requestId) headers.set("x-request-id", requestId);
  const method = c.req.raw.method;
  const init: RequestInit = {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : c.req.raw.body,
    redirect: "manual",
  };
  return binding.fetch(new Request(target.toString(), init));
}
