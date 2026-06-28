export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Shared secret for Auth0 Post Login Action claims lookup. */
  ACTION_CLAIMS_SECRET?: string;
  /** Optional SPA origin for absolute invite accept URLs (e.g. https://app.example.com). */
  INVITE_BASE_URL?: string;
};
