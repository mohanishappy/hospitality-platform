export const RESERVATION_DETAIL_SELECT =
  "id, chain_id, hotel_id, room_type_id, check_in, check_out, status, row_version, created_at, updated_at, pricing_snapshot, guest ( id, first_name, last_name, email, phone, created_at, updated_at )";

export const RESERVATION_LIST_SELECT =
  "id, chain_id, hotel_id, room_type_id, check_in, check_out, status, row_version, created_at, updated_at, pricing_snapshot";
