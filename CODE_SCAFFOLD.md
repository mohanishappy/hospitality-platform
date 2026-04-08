# Implementation bundle (historical reference)

**Sources now live in `services/*` and `supabase/migrations/`.** The blocks below match the initial scaffold; prefer the real files in the repo.

**Worker modules (`services/*`):** Keep each source file under ~300 lines. When a file grows past that, split helpers (types, validation, HTTP problem responses, Supabase client, middleware) and route handlers into focused modules rather than expanding a single entrypoint.

## Root: `package.json`

```json
{
  "name": "hospitality-platform",
  "private": true,
  "description": "Microservices on Cloudflare Workers + Supabase + Auth0",
  "workspaces": [
    "services/gateway",
    "services/inventory",
    "services/reservations"
  ],
  "scripts": {
    "dev:gateway": "npm run dev -w hospitality-gateway",
    "dev:inventory": "npm run dev -w hospitality-inventory",
    "dev:reservations": "npm run dev -w hospitality-reservations",
    "deploy:inventory": "npm run deploy -w hospitality-inventory",
    "deploy:reservations": "npm run deploy -w hospitality-reservations",
    "deploy:gateway": "npm run deploy -w hospitality-gateway",
    "deploy:all": "npm run deploy:inventory && npm run deploy:reservations && npm run deploy:gateway"
  },
  "engines": {
    "node": ">=20"
  }
}
```

## Root: `.gitignore`

```
node_modules/
.wrangler/
.dev.vars
.env
.env.*
!.env.example
dist/
*.log
.DS_Store
```

---

## `services/gateway/package.json`

```json
{
  "name": "hospitality-gateway",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "^4.6.14",
    "jose": "^5.9.6"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "wrangler": "^3.99.0",
    "@cloudflare/workers-types": "^4.20241230.0"
  }
}
```

## `services/gateway/wrangler.toml`

```toml
name = "hospitality-gateway"
main = "src/index.ts"
compatibility_date = "2024-12-30"

[[services]]
binding = "INVENTORY"
service = "hospitality-inventory"

[[services]]
binding = "RESERVATIONS"
service = "hospitality-reservations"
```

## `services/gateway/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"],
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

## `services/gateway/src/index.ts`

```typescript
import { Hono } from "hono";
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import { cors } from "hono/cors";

export type GatewayEnv = {
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  INVENTORY: Fetcher;
  RESERVATIONS: Fetcher;
};

type Variables = { jwt: JWTPayload; chainId: string };

function problem(
  status: number,
  title: string,
  detail: string,
  type: string
): Response {
  const body = { type, title, detail, status };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}

function getChainId(payload: JWTPayload): string | null {
  const ns = "https://hospitality.app/claims";
  const claims = payload as Record<string, unknown>;
  const fromNs = claims[`${ns}/chain_id`];
  const flat = claims.chain_id;
  const v = (fromNs ?? flat) as string | number | undefined | null;
  if (v === undefined || v === null) return null;
  return String(v);
}

const app = new Hono<{ Bindings: GatewayEnv; Variables: Variables }>();

app.use("*", cors());

app.get("/health", () =>
  new Response(JSON.stringify({ ok: true, service: "gateway" }), {
    headers: { "content-type": "application/json" },
  })
);

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return problem(401, "Unauthorized", "Missing Bearer token", "about:blank#missing-token");
  }
  const token = auth.slice(7);
  const domain = c.env.AUTH0_DOMAIN;
  const audience = c.env.AUTH0_AUDIENCE;
  if (!domain || !audience) {
    return problem(
      500,
      "Server Misconfigured",
      "AUTH0_DOMAIN and AUTH0_AUDIENCE must be set",
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
        "Access token must include chain_id claim",
        "about:blank#missing-chain"
      );
    }
    c.set("jwt", payload);
    c.set("chainId", chainId);
  } catch {
    return problem(401, "Unauthorized", "Invalid or expired token", "about:blank#invalid-token");
  }
  return next();
});

async function proxy(
  c: {
    req: { raw: Request; url: string };
    env: GatewayEnv;
    get: (k: keyof Variables) => string | JWTPayload;
  },
  binding: Fetcher,
  stripPrefix: string
): Promise<Response> {
  const url = new URL(c.req.url);
  const suffix = url.pathname.startsWith(stripPrefix)
    ? url.pathname.slice(stripPrefix.length) || "/"
    : url.pathname;
  const target = new URL(suffix + url.search, "https://internal");
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-chain-id", String(c.get("chainId")));
  const init: RequestInit = {
    method: c.req.raw.method,
    headers,
    body: ["GET", "HEAD"].includes(c.req.raw.method) ? undefined : c.req.raw.body,
    redirect: "manual",
  };
  return binding.fetch(new Request(target.toString(), init));
}

app.all("/v1/inventory/*", (c) => proxy(c, c.env.INVENTORY, "/v1/inventory"));
app.all("/v1/inventory", (c) => proxy(c, c.env.INVENTORY, "/v1/inventory"));
app.all("/v1/reservations/*", (c) =>
  proxy(c, c.env.RESERVATIONS, "/v1/reservations")
);
app.all("/v1/reservations", (c) =>
  proxy(c, c.env.RESERVATIONS, "/v1/reservations")
);

app.notFound(() =>
  problem(404, "Not Found", "No route matched", "about:blank#not-found")
);

export default app;
```

Fix the typo `app.use("*",cors())` → `app.use("*", cors())` after paste.

---

## `services/inventory/package.json`

```json
{
  "name": "hospitality-inventory",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "^4.6.14",
    "@supabase/supabase-js": "^2.47.10"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "wrangler": "^3.99.0",
    "@cloudflare/workers-types": "^4.20241230.0"
  }
}
```

## `services/inventory/wrangler.toml`

```toml
name = "hospitality-inventory"
main = "src/index.ts"
compatibility_date = "2024-12-30"
```

## `services/inventory/tsconfig.json`

Same as gateway `tsconfig.json` (copy).

## `services/inventory/src/index.ts`

```typescript
import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

function problem(status: number, title: string, detail: string): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank#inventory-error",
      title,
      detail,
      status,
    }),
    {
      status,
      headers: { "content-type": "application/problem+json; charset=utf-8" },
    }
  );
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (!c.req.header("x-chain-id")) {
    return problem(401, "Unauthorized", "Missing x-chain-id (use gateway)");
  }
  return next();
});

app.get("/health", (c) =>
  c.json({ ok: true, service: "inventory" })
);

app.get("/v1/hotels", async (c) => {
  const chainId = c.req.header("x-chain-id")!;
  const url = c.env.SUPABASE_URL;
  const key = c.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = createClient(url, key, {
    global: { headers: { "X-Client-Info": "hospitality-inventory-worker" } },
  });
  const { data, error } = await supa
    .schema("inventory")
    .from("hotel")
    .select("id,name,code")
    .eq("chain_id", chainId);
  if (error) return problem(500, "Database error", error.message);
  return c.json({ hotels: data ?? [] });
});

export default app;
```

---

## `services/reservations/package.json`

```json
{
  "name": "hospitality-reservations",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "^4.6.14",
    "@supabase/supabase-js": "^2.47.10"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "wrangler": "^3.99.0",
    "@cloudflare/workers-types": "^4.20241230.0"
  }
}
```

## `services/reservations/wrangler.toml`

```toml
name = "hospitality-reservations"
main = "src/index.ts"
compatibility_date = "2024-12-30"
```

## `services/reservations/tsconfig.json`

Same as gateway (copy).

## `services/reservations/src/index.ts`

```typescript
import { Hono } from "hono";

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

function problem(status: number, title: string, detail: string): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank#reservations-error",
      title,
      detail,
      status,
    }),
    {
      status,
      headers: { "content-type": "application/problem+json; charset=utf-8" },
    }
  );
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (!c.req.header("x-chain-id")) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  return next();
});

app.get("/health", (c) => c.json({ ok: true, service: "reservations" }));

app.post("/v1/reservations", async (c) => {
  const idem = c.req.header("idempotency-key");
  if (!idem) {
    return problem(
      400,
      "Bad Request",
      "Idempotency-Key header required (UUID)"
    );
  }
  // Stub: persist in phase 2 using Supabase + idempotency store
  return c.json(
    { status: "stub", idempotency_key: idem, message: "Not persisted yet" },
    201
  );
});

export default app;
```

---

## `supabase/migrations/0001_init.sql`

```sql
create schema if not exists inventory;
create schema if not exists reservations;

create table if not exists inventory.chain (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists inventory.hotel (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references inventory.chain (id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (chain_id, code)
);

create table if not exists inventory.room_type (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references inventory.chain (id) on delete restrict,
  hotel_id uuid not null references inventory.hotel (id) on delete cascade,
  name text not null,
  code text not null,
  capacity int not null default 2,
  unique (hotel_id, code)
);

-- Optional seed for local demo (remove in prod or parameterize)
insert into inventory.chain (id, name, code)
values ('00000000-0000-0000-0000-000000000001', 'Demo Chain', 'DEMO')
on conflict do nothing;

insert into inventory.hotel (chain_id, name, code)
values (
  '00000000-0000-0000-0000-000000000001',
  'Demo Hotel',
  'DEMO-H1'
)
on conflict do nothing;
```

---

## Fastest path after files exist

```bash
cd services/inventory && npm install && npx wrangler deploy
cd ../reservations && npm install && npx wrangler deploy
cd ../gateway && npm install
npx wrangler secret put AUTH0_DOMAIN
npx wrangler secret put AUTH0_AUDIENCE
# repeat secrets for Supabase on inventory + reservations
npx wrangler deploy
```

For **local dev**, add `services/gateway/.dev.vars`:

```
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_AUDIENCE=https://your-api-audience
```

(Add Supabase vars to inventory/reservations `.dev.vars`.)

---

## Auth0 custom claim

Add namespaced claim `https://hospitality.app/claims/chain_id` to access tokens (Action), matching `getChainId` in the gateway.
