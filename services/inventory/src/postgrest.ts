export function formatPostgrestError(error: {
  message: string;
  details?: string | null;
  hint?: string | null;
}): string {
  const parts = [error.message];
  if (error.details) parts.push(error.details);
  if (error.hint) parts.push(error.hint);
  return parts.join(" — ");
}
