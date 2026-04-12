export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type CreateReservationBody = {
  hotel_id: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  /** If set, create fails with **409** when it does not match the server-computed quote total (minor units). */
  expected_total_cents?: number | null;
  guest: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string | null;
  };
};

export type RpcResult = { reservation_id: string; created: boolean };

export type ReservationStatus = "pending" | "confirmed" | "cancelled";

export type GuestPatch = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
};
