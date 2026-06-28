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
  const roles = c.get("roles");
  if (roles !== undefined && roles !== null) {
    headers.set("x-roles", roles.join(","));
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
