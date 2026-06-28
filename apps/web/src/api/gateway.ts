export type HealthResponse = {
  ok: boolean;
  service: string;
};

export type ReadinessResponse = HealthResponse & {
  checks?: Record<string, boolean>;
};

export type HotelSummary = {
  id: string;
  name: string;
  code: string;
  chain_id: string;
  chain_name?: string;
  chain_code?: string;
};

export type HotelsResponse = {
  hotels: HotelSummary[];
};

export type FeeLineItem = {
  code?: string;
  label?: string;
  amount_cents?: number;
};

export type StayPricing = {
  currency?: string;
  base_rate_cents_per_night?: number | null;
  nightly_rate_cents?: number | null;
  nights?: number;
  room_subtotal_cents?: number | null;
  discount_cents?: number;
  tax_rate_bps?: number;
  tax_cents?: number;
  fee_fixed_cents?: number;
  fee_line_items?: FeeLineItem[];
  total_cents?: number;
  rate_plan_code?: string | null;
  promotion_code?: string | null;
};

export type InventorySearchHit = {
  hotel_id: string;
  hotel_name: string;
  room_type_id: string;
  room_type_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  bookable: boolean;
  pricing?: StayPricing;
};

export type SearchResponse = {
  results: InventorySearchHit[];
};

export type AvailabilityQuote = {
  room_type_id: string;
  hotel_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  bookable: boolean;
  remaining_units_on_tightest_night?: number;
  pricing?: StayPricing;
};

export type AvailabilityResponse = {
  availability: AvailabilityQuote;
};

export type SoftHoldResult = {
  hold_id: string;
  expires_at: string;
};

export type SoftHoldResponse = {
  soft_hold: SoftHoldResult;
};

export type GuestInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
};

export type PricingSnapshot = {
  currency?: string;
  room_subtotal_cents?: number;
  tax_cents?: number;
  fee_line_items?: FeeLineItem[];
  total_cents?: number;
};

export type ReservationDetail = {
  id: string;
  hotel_id: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  status: "pending" | "confirmed" | "cancelled";
  row_version?: number;
  cancellation_reason?: CancellationReason | null;
  cancelled_at?: string | null;
  internal_note?: string | null;
  guest_note?: string | null;
  pricing_snapshot?: PricingSnapshot | null;
  created_at?: string;
  updated_at?: string;
  guest?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string | null;
  } | null;
};

export type ReservationListItem = Omit<ReservationDetail, "guest"> & {
  chain_id?: string;
};

export type CancellationReason =
  | "guest_request"
  | "no_show"
  | "duplicate"
  | "rate_dispute"
  | "other";

export type ReservationsListResponse = {
  reservations: ReservationListItem[];
  limit: number;
  offset: number;
  has_more: boolean;
};

export type ReservationResponse = {
  reservation: ReservationDetail;
};

export type CreateReservationResponse = {
  reservation: ReservationDetail;
  idempotency_key: string;
  idempotent_replay: boolean;
};

export type RoomTypeSummary = {
  id: string;
  hotel_id: string;
  name: string;
  code: string;
  units_total?: number;
};

export type RoomTypesResponse = {
  hotel_id: string;
  room_types: RoomTypeSummary[];
};

export type CalendarDay = {
  date: string;
  occupancy?: number;
  soft_hold_units?: number;
  units_blocked?: number;
  sellable_capacity?: number;
  remaining_units?: number;
  bookable?: boolean;
};

export type CalendarResponse = {
  days: CalendarDay[];
};

export type ChainSummary = {
  id: string;
  code: string;
  name: string;
  enterprise_id?: string;
  default_currency?: string;
};

export type EnterpriseSummary = {
  id: string;
  code: string;
  name: string;
};

export type EnterprisesResponse = {
  enterprises: EnterpriseSummary[];
};

export type EnterpriseResponse = {
  enterprise: EnterpriseSummary;
};

export type ChainsResponse = {
  chains: ChainSummary[];
};

export type ChainResponse = {
  chain: ChainSummary;
};

export type BookingAuth =
  | { kind: "token"; accessToken: string; chainCode?: string }
  | { kind: "chain"; chainCode: string };

function bookingAuthHeaders(auth: BookingAuth): Record<string, string> {
  if (auth.kind === "token") {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.accessToken}`,
    };
    if (auth.chainCode?.trim()) {
      headers["x-chain-code"] = auth.chainCode.trim().toUpperCase();
    }
    return headers;
  }
  return { "x-chain-code": auth.chainCode.trim().toUpperCase() };
}

export function tokenAuthHeaders(
  accessToken: string,
  chainCode?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (chainCode?.trim()) {
    headers["x-chain-code"] = chainCode.trim().toUpperCase();
  }
  return headers;
}

export class GatewayError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

type GatewayResult<T> = {
  body: T;
  etag: string | null;
  status: number;
};

function parseErrorBody(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    return String((body as { detail: unknown }).detail);
  }
  if (typeof body === "object" && body !== null && "title" in body) {
    return String((body as { title: unknown }).title);
  }
  return fallback;
}

async function gatewayRequest<T>(
  gatewayUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<GatewayResult<T>> {
  const res = await fetch(`${gatewayUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new GatewayError(
      res.status,
      parseErrorBody(body, res.statusText || `HTTP ${res.status}`)
    );
  }

  return {
    body: body as T,
    etag: res.headers.get("ETag"),
    status: res.status,
  };
}

export async function gatewayFetch<T>(
  gatewayUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const result = await gatewayRequest<T>(gatewayUrl, path, init);
  return result.body;
}

export function fetchHealth(gatewayUrl: string) {
  return gatewayFetch<HealthResponse>(gatewayUrl, "/health");
}

export function fetchReadiness(gatewayUrl: string) {
  return gatewayFetch<ReadinessResponse>(gatewayUrl, "/health/ready");
}

export function fetchHotels(
  gatewayUrl: string,
  auth: BookingAuth | string,
  chainCode?: string
) {
  const headers =
    typeof auth === "string"
      ? tokenAuthHeaders(auth, chainCode)
      : bookingAuthHeaders(auth);
  return gatewayFetch<HotelsResponse>(gatewayUrl, "/v1/inventory/hotels", {
    headers,
  });
}

export function fetchEnterprises(gatewayUrl: string) {
  return gatewayFetch<EnterprisesResponse>(
    gatewayUrl,
    "/v1/inventory/enterprises"
  );
}

export function fetchEnterpriseByCode(gatewayUrl: string, enterpriseCode: string) {
  return gatewayFetch<EnterpriseResponse>(
    gatewayUrl,
    `/v1/inventory/enterprises/${encodeURIComponent(enterpriseCode.trim().toUpperCase())}`
  );
}

export function fetchEnterpriseChains(gatewayUrl: string, enterpriseCode: string) {
  return gatewayFetch<ChainsResponse>(
    gatewayUrl,
    `/v1/inventory/enterprises/${encodeURIComponent(enterpriseCode.trim().toUpperCase())}/chains`
  );
}

/** Chains the authenticated user may access (gateway-resolved scope). */
export function fetchMyChains(gatewayUrl: string, accessToken: string) {
  return gatewayFetch<ChainsResponse>(gatewayUrl, "/v1/inventory/me/chains", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export type AcceptInviteResponse = {
  accepted: boolean;
  staff_member_id: string;
  enterprise_id: string;
  message?: string;
};

export function acceptStaffInvite(
  gatewayUrl: string,
  accessToken: string,
  token: string
) {
  return gatewayFetch<AcceptInviteResponse>(
    gatewayUrl,
    "/v1/inventory/invites/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    }
  );
}

export type StaffMember = {
  id: string;
  enterprise_id: string;
  auth0_sub: string | null;
  email: string;
  display_name: string | null;
  all_chains: boolean;
  active: boolean;
  status: string;
  intended_role: string;
  chain_ids: string[];
  created_at: string;
  updated_at: string;
};

export type StaffListResponse = {
  staff: StaffMember[];
};

export type StaffInviteResponse = {
  invite: {
    staff_member_id: string;
    email: string;
    intended_role: string;
    status: string;
    expires_at: string;
    accept_url: string;
  };
};

function adminAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export function listAdminStaff(gatewayUrl: string, accessToken: string) {
  return gatewayFetch<StaffListResponse>(
    gatewayUrl,
    "/v1/inventory/admin/staff",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function inviteStaffMember(
  gatewayUrl: string,
  accessToken: string,
  body: {
    email: string;
    intended_role: string;
    all_chains?: boolean;
    chain_ids?: string[];
    display_name?: string;
  }
) {
  return gatewayFetch<StaffInviteResponse>(
    gatewayUrl,
    "/v1/inventory/admin/staff/invite",
    {
      method: "POST",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function patchStaffMember(
  gatewayUrl: string,
  accessToken: string,
  staffId: string,
  body: {
    active?: boolean;
    all_chains?: boolean;
    display_name?: string | null;
  }
) {
  return gatewayFetch<{ staff: StaffMember }>(
    gatewayUrl,
    `/v1/inventory/admin/staff/${encodeURIComponent(staffId)}`,
    {
      method: "PATCH",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function replaceStaffChainGrants(
  gatewayUrl: string,
  accessToken: string,
  staffId: string,
  chainIds: string[]
) {
  return gatewayFetch<{ staff: StaffMember }>(
    gatewayUrl,
    `/v1/inventory/admin/staff/${encodeURIComponent(staffId)}/chains`,
    {
      method: "PUT",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify({ chain_ids: chainIds }),
    }
  );
}

export type AdminHotel = {
  id: string;
  chain_id: string;
  name: string;
  code: string;
  created_at: string;
  booking_min_los?: number | null;
  booking_max_los?: number | null;
  booking_closed_arrival_dow?: number[] | null;
  booking_closed_departure_dow?: number[] | null;
  booking_timezone?: string | null;
  booking_same_day_cutoff_time?: string | null;
};

export type AdminRoomType = {
  id: string;
  hotel_id: string;
  chain_id: string;
  name: string;
  code: string;
  capacity: number;
  created_at: string;
  units_total: number;
  base_rate_cents: number | null;
  tax_rate_bps: number;
  fee_fixed_cents: number;
  overbooking_allowance: number;
};

export function createAdminChain(
  gatewayUrl: string,
  accessToken: string,
  body: { code: string; name: string; default_currency?: string }
) {
  return gatewayFetch<{ chain: ChainSummary }>(
    gatewayUrl,
    "/v1/inventory/admin/chains",
    {
      method: "POST",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function patchAdminChain(
  gatewayUrl: string,
  accessToken: string,
  chainId: string,
  body: { code?: string; name?: string; default_currency?: string }
) {
  return gatewayFetch<{ chain: ChainSummary }>(
    gatewayUrl,
    `/v1/inventory/admin/chains/${encodeURIComponent(chainId)}`,
    {
      method: "PATCH",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function listAdminHotels(
  gatewayUrl: string,
  accessToken: string,
  chainId: string
) {
  return gatewayFetch<{ chain_id: string; hotels: AdminHotel[] }>(
    gatewayUrl,
    `/v1/inventory/admin/chains/${encodeURIComponent(chainId)}/hotels`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function createAdminHotel(
  gatewayUrl: string,
  accessToken: string,
  chainId: string,
  body: { code: string; name: string }
) {
  return gatewayFetch<{ hotel: AdminHotel }>(
    gatewayUrl,
    `/v1/inventory/admin/chains/${encodeURIComponent(chainId)}/hotels`,
    {
      method: "POST",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function getAdminHotel(
  gatewayUrl: string,
  accessToken: string,
  hotelId: string
) {
  return gatewayFetch<{ hotel: AdminHotel }>(
    gatewayUrl,
    `/v1/inventory/admin/hotels/${encodeURIComponent(hotelId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function patchAdminHotel(
  gatewayUrl: string,
  accessToken: string,
  hotelId: string,
  body: Partial<
    Pick<
      AdminHotel,
      | "name"
      | "code"
      | "booking_min_los"
      | "booking_max_los"
      | "booking_closed_arrival_dow"
      | "booking_closed_departure_dow"
      | "booking_timezone"
      | "booking_same_day_cutoff_time"
    >
  >
) {
  return gatewayFetch<{ hotel: AdminHotel }>(
    gatewayUrl,
    `/v1/inventory/admin/hotels/${encodeURIComponent(hotelId)}`,
    {
      method: "PATCH",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function listAdminRoomTypes(
  gatewayUrl: string,
  accessToken: string,
  hotelId: string
) {
  return gatewayFetch<{ hotel_id: string; room_types: AdminRoomType[] }>(
    gatewayUrl,
    `/v1/inventory/admin/hotels/${encodeURIComponent(hotelId)}/room-types`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function createAdminRoomType(
  gatewayUrl: string,
  accessToken: string,
  hotelId: string,
  body: {
    code: string;
    name: string;
    capacity?: number;
    units_total?: number;
    overbooking_allowance?: number;
    base_rate_cents?: number;
    tax_rate_bps?: number;
    fee_fixed_cents?: number;
  }
) {
  return gatewayFetch<{ room_type: AdminRoomType }>(
    gatewayUrl,
    `/v1/inventory/admin/hotels/${encodeURIComponent(hotelId)}/room-types`,
    {
      method: "POST",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function patchAdminRoomType(
  gatewayUrl: string,
  accessToken: string,
  roomTypeId: string,
  body: Partial<
    Pick<
      AdminRoomType,
      | "name"
      | "code"
      | "capacity"
      | "units_total"
      | "overbooking_allowance"
      | "base_rate_cents"
      | "tax_rate_bps"
      | "fee_fixed_cents"
    >
  >
) {
  return gatewayFetch<{ room_type: AdminRoomType }>(
    gatewayUrl,
    `/v1/inventory/admin/room-types/${encodeURIComponent(roomTypeId)}`,
    {
      method: "PATCH",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export type AdminRatePlan = {
  id: string;
  chain_id: string;
  hotel_id: string | null;
  room_type_id: string | null;
  code: string;
  label: string | null;
  priority: number;
  valid_from: string;
  valid_to: string | null;
  nightly_rate_cents: number | null;
  created_at: string;
};

export type AdminLosTier = {
  id: string;
  rate_plan_id: string;
  min_nights: number;
  max_nights: number | null;
  nightly_rate_cents: number;
};

export type AdminPromotion = {
  id: string;
  chain_id: string;
  code: string;
  label: string | null;
  active: boolean;
  discount_percent_bps: number;
  discount_amount_cents: number;
  min_los: number;
  valid_from: string;
  valid_to: string | null;
  blackout_dates: string[];
  created_at: string;
};

export type AdminInventoryBlock = {
  id: string;
  chain_id: string;
  hotel_id: string;
  room_type_id: string;
  units_reduced: number;
  start_date: string;
  end_date: string;
  label: string | null;
};

export function listAdminRatePlans(
  gatewayUrl: string,
  accessToken: string,
  chainId: string
) {
  return gatewayFetch<{ chain_id: string; rate_plans: AdminRatePlan[] }>(
    gatewayUrl,
    `/v1/inventory/admin/chains/${encodeURIComponent(chainId)}/rate-plans`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function createAdminRatePlan(
  gatewayUrl: string,
  accessToken: string,
  chainId: string,
  body: {
    code: string;
    label?: string;
    priority?: number;
    valid_from: string;
    valid_to?: string | null;
    nightly_rate_cents?: number | null;
    hotel_id?: string | null;
    room_type_id?: string | null;
  }
) {
  return gatewayFetch<{ rate_plan: AdminRatePlan }>(
    gatewayUrl,
    `/v1/inventory/admin/chains/${encodeURIComponent(chainId)}/rate-plans`,
    {
      method: "POST",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function getAdminRatePlan(
  gatewayUrl: string,
  accessToken: string,
  ratePlanId: string
) {
  return gatewayFetch<{ rate_plan: AdminRatePlan; los_tiers: AdminLosTier[] }>(
    gatewayUrl,
    `/v1/inventory/admin/rate-plans/${encodeURIComponent(ratePlanId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function patchAdminRatePlan(
  gatewayUrl: string,
  accessToken: string,
  ratePlanId: string,
  body: Partial<{
    code: string;
    label: string | null;
    priority: number;
    valid_from: string;
    valid_to: string | null;
    nightly_rate_cents: number | null;
    hotel_id: string | null;
    room_type_id: string | null;
  }>
) {
  return gatewayFetch<{ rate_plan: AdminRatePlan }>(
    gatewayUrl,
    `/v1/inventory/admin/rate-plans/${encodeURIComponent(ratePlanId)}`,
    {
      method: "PATCH",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function putAdminRatePlanLosTiers(
  gatewayUrl: string,
  accessToken: string,
  ratePlanId: string,
  tiers: {
    min_nights: number;
    max_nights?: number | null;
    nightly_rate_cents: number;
  }[]
) {
  return gatewayFetch<{ rate_plan_id: string; los_tiers: AdminLosTier[] }>(
    gatewayUrl,
    `/v1/inventory/admin/rate-plans/${encodeURIComponent(ratePlanId)}/los-tiers`,
    {
      method: "PUT",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify({ tiers }),
    }
  );
}

export function listAdminPromotions(
  gatewayUrl: string,
  accessToken: string,
  chainId: string
) {
  return gatewayFetch<{ chain_id: string; promotions: AdminPromotion[] }>(
    gatewayUrl,
    `/v1/inventory/admin/chains/${encodeURIComponent(chainId)}/promotions`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function createAdminPromotion(
  gatewayUrl: string,
  accessToken: string,
  chainId: string,
  body: {
    code: string;
    label?: string;
    active?: boolean;
    discount_percent_bps?: number;
    discount_amount_cents?: number;
    min_los?: number;
    valid_from: string;
    valid_to?: string | null;
    blackout_dates?: string[];
  }
) {
  return gatewayFetch<{ promotion: AdminPromotion }>(
    gatewayUrl,
    `/v1/inventory/admin/chains/${encodeURIComponent(chainId)}/promotions`,
    {
      method: "POST",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function patchAdminPromotion(
  gatewayUrl: string,
  accessToken: string,
  promotionId: string,
  body: Partial<{
    code: string;
    label: string | null;
    active: boolean;
    discount_percent_bps: number;
    discount_amount_cents: number;
    min_los: number;
    valid_from: string;
    valid_to: string | null;
    blackout_dates: string[];
  }>
) {
  return gatewayFetch<{ promotion: AdminPromotion }>(
    gatewayUrl,
    `/v1/inventory/admin/promotions/${encodeURIComponent(promotionId)}`,
    {
      method: "PATCH",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function listAdminBlocks(
  gatewayUrl: string,
  accessToken: string,
  roomTypeId: string
) {
  return gatewayFetch<{ room_type_id: string; blocks: AdminInventoryBlock[] }>(
    gatewayUrl,
    `/v1/inventory/admin/room-types/${encodeURIComponent(roomTypeId)}/blocks`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export function createAdminBlock(
  gatewayUrl: string,
  accessToken: string,
  roomTypeId: string,
  body: {
    start_date: string;
    end_date: string;
    units_reduced: number;
    label?: string;
  }
) {
  return gatewayFetch<{ block: AdminInventoryBlock }>(
    gatewayUrl,
    `/v1/inventory/admin/room-types/${encodeURIComponent(roomTypeId)}/blocks`,
    {
      method: "POST",
      headers: adminAuthHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
}

export function deleteAdminBlock(
  gatewayUrl: string,
  accessToken: string,
  blockId: string
) {
  return gatewayFetch<void>(
    gatewayUrl,
    `/v1/inventory/admin/blocks/${encodeURIComponent(blockId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export function fetchChains(gatewayUrl: string) {
  return gatewayFetch<ChainsResponse>(gatewayUrl, "/v1/inventory/chains");
}

export function fetchChainByCode(gatewayUrl: string, chainCode: string) {
  return gatewayFetch<ChainResponse>(
    gatewayUrl,
    `/v1/inventory/chains/${encodeURIComponent(chainCode.trim().toUpperCase())}`
  );
}

export type BookingPricingOptions = {
  promotionCode?: string;
  ratePlanCode?: string;
};

function appendPricingQuery(
  qs: URLSearchParams,
  options?: BookingPricingOptions
) {
  const promo = options?.promotionCode?.trim();
  if (promo) qs.set("promotion_code", promo);
  const plan = options?.ratePlanCode?.trim();
  if (plan) qs.set("rate_plan_code", plan);
}

export function fetchSearch(
  gatewayUrl: string,
  auth: BookingAuth | string,
  params: {
    checkIn: string;
    checkOut: string;
    hotelIds?: string[];
  } & BookingPricingOptions
) {
  const headers =
    typeof auth === "string"
      ? { Authorization: `Bearer ${auth}` }
      : bookingAuthHeaders(auth);
  const qs = new URLSearchParams({
    check_in: params.checkIn,
    check_out: params.checkOut,
    sort: "price",
    limit: "20",
  });
  if (params.hotelIds?.length) {
    qs.set("hotel_ids", params.hotelIds.join(","));
  }
  appendPricingQuery(qs, params);
  return gatewayFetch<SearchResponse>(
    gatewayUrl,
    `/v1/inventory/search?${qs.toString()}`,
    { headers }
  );
}

export function fetchAvailability(
  gatewayUrl: string,
  auth: BookingAuth | string,
  params: {
    hotelId: string;
    roomTypeId: string;
    checkIn: string;
    checkOut: string;
  } & BookingPricingOptions
) {
  const headers =
    typeof auth === "string"
      ? { Authorization: `Bearer ${auth}` }
      : bookingAuthHeaders(auth);
  const qs = new URLSearchParams({
    check_in: params.checkIn,
    check_out: params.checkOut,
  });
  appendPricingQuery(qs, params);
  return gatewayFetch<AvailabilityResponse>(
    gatewayUrl,
    `/v1/inventory/hotels/${params.hotelId}/room-types/${params.roomTypeId}/availability?${qs.toString()}`,
    { headers }
  );
}

export const DEFAULT_SOFT_HOLD_TTL_SECONDS = 900;

export function createSoftHold(
  gatewayUrl: string,
  auth: BookingAuth | string,
  params: {
    hotelId: string;
    roomTypeId: string;
    checkIn: string;
    checkOut: string;
    ttlSeconds?: number;
    unitsHeld?: number;
  }
) {
  const headers: Record<string, string> = {
    ...(typeof auth === "string"
      ? { Authorization: `Bearer ${auth}` }
      : bookingAuthHeaders(auth)),
    "Content-Type": "application/json",
  };
  return gatewayFetch<SoftHoldResponse>(
    gatewayUrl,
    `/v1/inventory/hotels/${params.hotelId}/room-types/${params.roomTypeId}/soft-holds`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        check_in: params.checkIn,
        check_out: params.checkOut,
        ttl_seconds: params.ttlSeconds ?? DEFAULT_SOFT_HOLD_TTL_SECONDS,
        units_held: params.unitsHeld ?? 1,
      }),
    }
  );
}

export function releaseSoftHold(
  gatewayUrl: string,
  auth: BookingAuth | string,
  holdId: string
) {
  const headers =
    typeof auth === "string"
      ? { Authorization: `Bearer ${auth}` }
      : bookingAuthHeaders(auth);
  return gatewayFetch<{ result: { released: boolean } }>(
    gatewayUrl,
    `/v1/inventory/soft-holds/${holdId}`,
    { method: "DELETE", headers }
  );
}

export function createReservation(
  gatewayUrl: string,
  auth: BookingAuth | string,
  idempotencyKey: string,
  body: {
    hotel_id: string;
    room_type_id: string;
    check_in: string;
    check_out: string;
    expected_total_cents?: number;
    rate_plan_code?: string;
    promotion_code?: string;
    guest: GuestInput;
  }
) {
  const headers: Record<string, string> = {
    ...(typeof auth === "string"
      ? { Authorization: `Bearer ${auth}` }
      : bookingAuthHeaders(auth)),
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
  const payload: Record<string, unknown> = { ...body };
  const plan = body.rate_plan_code?.trim();
  const promo = body.promotion_code?.trim();
  if (plan) payload.rate_plan_code = plan;
  else delete payload.rate_plan_code;
  if (promo) payload.promotion_code = promo;
  else delete payload.promotion_code;
  return gatewayFetch<CreateReservationResponse>(gatewayUrl, "/v1/reservations", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

export function fetchRoomTypes(
  gatewayUrl: string,
  accessToken: string,
  hotelId: string,
  chainCode?: string
) {
  return gatewayFetch<RoomTypesResponse>(
    gatewayUrl,
    `/v1/inventory/hotels/${hotelId}/room-types`,
    { headers: tokenAuthHeaders(accessToken, chainCode) }
  );
}

export function fetchCalendar(
  gatewayUrl: string,
  accessToken: string,
  params: {
    hotelId: string;
    roomTypeId: string;
    from: string;
    to: string;
  },
  chainCode?: string
) {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return gatewayFetch<CalendarResponse>(
    gatewayUrl,
    `/v1/inventory/hotels/${params.hotelId}/room-types/${params.roomTypeId}/calendar?${qs.toString()}`,
    { headers: tokenAuthHeaders(accessToken, chainCode) }
  );
}

export function listReservations(
  gatewayUrl: string,
  accessToken: string,
  params: {
    limit?: number;
    offset?: number;
    status?: ReservationDetail["status"];
    hotelId?: string;
    chainId?: string;
  } = {},
  chainCode?: string
) {
  const qs = new URLSearchParams({
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
  });
  if (params.status) qs.set("status", params.status);
  if (params.hotelId) qs.set("hotel_id", params.hotelId);
  if (params.chainId) qs.set("chain_id", params.chainId);
  return gatewayFetch<ReservationsListResponse>(
    gatewayUrl,
    `/v1/reservations?${qs.toString()}`,
    { headers: tokenAuthHeaders(accessToken, chainCode) }
  );
}

export function getReservation(
  gatewayUrl: string,
  accessToken: string,
  reservationId: string,
  chainCode?: string
) {
  return gatewayRequest<ReservationResponse>(
    gatewayUrl,
    `/v1/reservations/${reservationId}`,
    { headers: tokenAuthHeaders(accessToken, chainCode) }
  );
}

export function patchReservationStatus(
  gatewayUrl: string,
  accessToken: string,
  reservationId: string,
  body: {
    status: ReservationDetail["status"];
    cancellation_reason?: CancellationReason;
  },
  ifMatch?: string | null,
  chainCode?: string
) {
  const headers: Record<string, string> = {
    ...tokenAuthHeaders(accessToken, chainCode),
    "Content-Type": "application/json",
  };
  if (ifMatch) headers["If-Match"] = ifMatch;
  return gatewayRequest<ReservationResponse>(
    gatewayUrl,
    `/v1/reservations/${reservationId}`,
    { method: "PATCH", headers, body: JSON.stringify(body) }
  );
}

export function patchReservationNotes(
  gatewayUrl: string,
  accessToken: string,
  reservationId: string,
  body: { internal_note?: string | null; guest_note?: string | null },
  ifMatch?: string | null,
  chainCode?: string
) {
  const headers: Record<string, string> = {
    ...tokenAuthHeaders(accessToken, chainCode),
    "Content-Type": "application/json",
  };
  if (ifMatch) headers["If-Match"] = ifMatch;
  return gatewayRequest<ReservationResponse>(
    gatewayUrl,
    `/v1/reservations/${reservationId}/notes`,
    { method: "PATCH", headers, body: JSON.stringify(body) }
  );
}
