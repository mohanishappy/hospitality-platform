import { createClient } from "@supabase/supabase-js";
import type { Env } from "./types";

export function supaClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { "X-Client-Info": "hospitality-reservations-worker" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
