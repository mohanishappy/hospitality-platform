const POST_LOGOUT_RETURN_KEY = "hospitality.postLogoutReturn";

/** Remember brand path; Auth0 logout must use origin-only returnTo. */
export function stashPostLogoutReturn(pathnameAndSearch: string) {
  const path = pathnameAndSearch.trim();
  if (path && path !== "/") {
    sessionStorage.setItem(POST_LOGOUT_RETURN_KEY, path);
  }
}

export function consumePostLogoutReturn(): string | null {
  const path = sessionStorage.getItem(POST_LOGOUT_RETURN_KEY);
  if (path) sessionStorage.removeItem(POST_LOGOUT_RETURN_KEY);
  return path;
}
