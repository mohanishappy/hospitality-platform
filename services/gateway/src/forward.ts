import type { Context } from "hono";
import type { GatewayEnv, GatewayVariables } from "./types";

export async function forward(
  c: Context<{ Bindings: GatewayEnv; Variables: GatewayVariables }>,
  binding: Fetcher
): Promise<Response> {
  const url = new URL(c.req.url);
  const target = new URL(url.pathname + url.search, "https://internal");
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-chain-id", c.get("chainId"));
  const method = c.req.raw.method;
  const init: RequestInit = {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : c.req.raw.body,
    redirect: "manual",
  };
  return binding.fetch(new Request(target.toString(), init));
}
