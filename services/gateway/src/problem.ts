export function problem(
  status: number,
  title: string,
  detail: string,
  type: string
): Response {
  const body = { type, title, detail, status };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}
