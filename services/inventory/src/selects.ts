export const HOTEL_LIST_SELECT = "id,name,code,chain_id";

export const HOTEL_LIST_WITH_CHAIN_SELECT =
  "id,name,code,chain_id, chain:chain_id ( name, code )";

export const HOTEL_DETAIL_SELECT = "id,name,code,chain_id,created_at";

export const ADMIN_HOTEL_SELECT =
  "id,name,code,chain_id,created_at,booking_min_los,booking_max_los,booking_closed_arrival_dow,booking_closed_departure_dow,booking_timezone,booking_same_day_cutoff_time";

export const ROOM_TYPE_LIST_SELECT =
  "id,hotel_id,chain_id,name,code,capacity,created_at,units_total,base_rate_cents,currency,overbooking_allowance,tax_rate_bps,fee_fixed_cents";
