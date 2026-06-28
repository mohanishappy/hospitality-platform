# Phase 9 — Fast-track plan (Platform Portal + Enterprise Admin Portal)

Canonical auth design: [`AUTHORIZATION.md`](AUTHORIZATION.md). Tracker: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

**Goal:** Platform ops onboards **enterprises + first all-chain manager**; Enterprise Admin Portal manages **brands, staff (email invite), and grants** — **no SQL, no per-user Auth0 Dashboard steps**.

**Authorization decision (locked):** **DB-driven roles + brand scope.** Auth0 = identity only (login, MFA, global block). Post Login Action copies **`enterprise_id`** and **`roles`** from **`staff_member`** onto the JWT. Auth0 RBAC per-user assignment is **not** used for app permissions.

**Speed strategy:** thin vertical slices; one shared **invite service**; merge Enterprise Admin UI (staff + brands); defer Auth0 Organizations and grant audit until after core flows work.

---

## Portal naming

| Name | Route (target) | Persona |
|------|----------------|---------|
| **Platform Portal** | `/platform/*` | Internal ops — create enterprise, bootstrap first admin |
| **Enterprise Admin Portal** | `/e/:code/admin/*` | Customer all-chain manager + delegated managers |
| **Brand booking sites** | `/c/:code` | Guests + staff ops (existing SPA) |

Platform Portal uses a **separate Auth0 SPA** (same API audience). Internal users get **`platform_operator`** via a DB row (same Action lookup pattern as staff).

---

## Phase 9A — Staff UX fixes (≈½ day) **ship first**

| Work | Deliverable |
|------|-------------|
| `accessWarning` SPA | Banner when staff not provisioned; preserve JWT roles on API failure |
| Reservations gating | Show panel without blocking on `defaultChainId` load |

**Exit:** Staff sees *why* access failed (not blank calendar).

**Status:** Local diff ready — commit + `deploy-web`.

---

## Phase 9B — Invite backend + DB-driven claims (≈2–3 days)

Core slice — everything else depends on this.

### Migration **0019**

| Column / table | Purpose |
|----------------|---------|
| `staff_member.status` | `pending` \| `active` \| `disabled` |
| `staff_member.intended_role` | `manager` \| `front_desk` \| `read_only` (copied to JWT by Action) |
| `staff_member.auth0_sub` | **Nullable** while `pending`; set on accept |
| `staff_invite` | `token_hash`, `expires_at`, `staff_member_id`, `invited_by`, `accepted_at` |

Unique constraints unchanged: `(enterprise_id, email)`; `(enterprise_id, auth0_sub)` when sub is set.

### APIs (inventory)

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /v1/inventory/admin/staff/invite` | `staff:admin` | Create pending staff + invite; **dev:** return accept URL in JSON |
| `POST /v1/inventory/invites/accept` | Bearer | Body `{ token }` → verify hash, match JWT email, set `auth0_sub`, `status=active` |
| `GET /v1/inventory/internal/staff/claims` | Shared secret header | Action-only: `{ email }` → `{ enterprise_id, roles }` |

`POST /v1/inventory/admin/staff` (manual `auth0_sub`) remains **break-glass** only; not used by portals.

### Gateway (9B)

- **Zero-brand enterprise:** allow empty `x-chain-ids` for admin, invite, platform, and `/me/chains` routes (manager with `all_chains` must reach admin UI before brands exist).
- Register new routes in `authorization.ts` (`staff:admin`, `platform:admin`).

### Auth0 Post Login Action (9B)

1. Call inventory **`GET /internal/staff/claims?email=`** (secret: `ACTION_CLAIMS_SECRET`).
2. If staff row found → set `enterprise_id` + `roles: [intended_role]` on access + ID tokens.
3. If platform operator row found → add `platform_operator` to roles (or separate lookup).
4. Else → `roles: ["guest"]`; omit `enterprise_id` (guest booking / signup).

**Do not** read Auth0 RBAC assignment for app permissions. RBAC role names may remain defined in Auth0 for documentation only.

### SPA (minimal, 9B)

- Route **`/invite/accept?token=`** — store token → Auth0 login → `POST /invites/accept` → redirect to admin or enterprise hub.

### Tests

Create invite / accept / expired / email mismatch / zero-brand admin access.

**Exit:** Postman or copy-link invite → one login → staff provisioned with correct role and enterprise; no SQL, no Auth0 user role assignment.

---

## Phase 9C — Email delivery (≈1–2 days)

| Work | Deliverable |
|------|-------------|
| Email provider | Resend or SendGrid (Wrangler secret) |
| Wire invite API | Send accept URL; hide raw token in JSON when mailer configured |
| Resend / revoke | Admin API + UI hooks |

**Exit:** Production email invite end-to-end.

---

## Phase 9D — Enterprise Admin Portal (≈3–4 days)

Single shell at **`/e/:code/admin`** with **Staff** and **Brands** sections (merged 9D + 9F UI).

| Work | Deliverable |
|------|-------------|
| Shell | Manager gate (JWT `manager` from DB-driven claim) |
| **Staff** tab | List pending/active; invite form; edit grants (existing PATCH/PUT) |
| **Brands** tab | List/create/edit brands (**9F** API below) |

**Depends on:** 9B (9C for email; dev URL enough initially).

---

## Phase 9E — Platform Portal (≈2–3 days)

| Work | Deliverable |
|------|-------------|
| Auth | `platform_operator` via DB + Action |
| `POST /v1/inventory/platform/enterprises` | Create enterprise only — **no brands** |
| Bootstrap invite | Reuse invite service → first all-chain manager (`intended_role: manager`) |
| UI | `/platform/*` — list/create enterprise; send bootstrap invite |

**Exit:** New tenant without SQL bootstrap.

**Status:** **Shipped** — API + Platform Portal UI at `/platform`.

**Depends on:** 9B invite service + zero-brand gateway bypass.

---

## Phase 9F — Admin brand CRUD API (≈1–2 days, parallel with 9E)

| Work | Deliverable |
|------|-------------|
| `POST/PATCH /v1/inventory/admin/chains` | Manager-scoped; validate `enterprise_id` from token |

UI ships in **9D** shell (Brands tab). Platform Portal does **not** create brands.

**Status:** **Shipped** — API + Brands tab create/edit (with **10C** UI batch).

---

## Phase 9G — Lifecycle polish (≈1–2 days)

| Work | Deliverable |
|------|-------------|
| `enterprise.active` | Gateway 403 when suspended; Platform toggle |
| Cache | Document 60s gateway TTL (see [`UI_TESTING.md`](UI_TESTING.md)) |
| Audit (optional) | `granted_by` on grants (`granted_at` exists) — **deferred** |
| SPA copy | Update `accessWarning` messages — no SQL references |

**Status:** **Shipped** — suspend/reactivate in Platform Portal; gateway enforces `enterprise.active`; zero-brand admin bypass fixed in middleware.

---

## Phase 10+ (later)

- Auth0 Organizations per enterprise (SSO customers)
- IdP group → role mapping in Action (enterprise tier)
- Integration clients admin UI
- Hotel / catalog admin
- Optional: gateway reads role from staff lookup directly (drop roles from JWT entirely)

---

## 3-week schedule (aggressive)

| Week | Ship | Milestone |
|------|------|-----------|
| **W1** | 9A, 9B, start 9D shell | Invite + DB claims work in dev |
| **W2** | 9C, finish 9D, 9F API, start 9E | Email invite + Enterprise Admin live |
| **W3** | 9E, 9G | Platform Portal + suspend + polish |

**Parallel:** 9F API while 9E Platform UI; 9D Brands tab when 9F API lands.

---

## Shared invite service (build once in 9B)

```text
createInvite(enterpriseId, email, intendedRole, grants, invitedBy)
  → staff_member (status=pending, auth0_sub=null, intended_role)
  → staff_invite (token_hash, expires_at)
  → [9C] sendEmail(/invite/accept?token=…)
  → [9B dev] return acceptUrl in API response

acceptInvite(token, auth0Sub, emailFromJwt)
  → verify token (constant-time), email match, not expired
  → set auth0_sub, status=active, mark invite accepted
  → user re-login OR next token refresh picks up claims via Action
```

Used by **Platform Portal** (bootstrap) and **Enterprise Admin Portal** (staff).

---

## FR mapping

| FR | Phase | Topic |
|----|-------|--------|
| FR-Z3 | shipped | Enterprise multi-brand |
| FR-Z1 (evolve) | **9B** | DB-driven roles on JWT (Action) |
| FR-Z4 | 9B–9D | Staff invite + Enterprise Admin Portal |
| FR-Z5 | 9E | Platform Portal bootstrap |
| FR-Z6 | 9F | Manager-created brands |

---

## Out of scope (fast path)

- Auth0 Management API per invite
- Auth0 RBAC assignment per staff member
- Per-route permission matrix UI
- Separate authz worker
- Hotel / rate-plan admin

---

## Implementation checklist (9B kickoff)

- [ ] Migration **0019** applied
- [ ] Invite + accept handlers + tests
- [ ] Internal claims endpoint + `ACTION_CLAIMS_SECRET`
- [ ] Gateway: zero-brand bypass + new route permissions
- [ ] Auth0 Action updated (README target snippet)
- [ ] SPA `/invite/accept` minimal route
- [ ] Postman: invite + accept flows
- [ ] Deprecate interim SQL + Auth0 RBAC docs in README
