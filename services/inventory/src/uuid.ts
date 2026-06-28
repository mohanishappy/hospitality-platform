/** Canonical 8-4-4-4-12 hex UUID (includes legacy seed ids such as DEMO). */
export const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_LIKE.test(value.trim());
}
