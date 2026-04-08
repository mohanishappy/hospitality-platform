export function problem(status: number, title: string, detail: string): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank#inventory-error",
      title,
      detail,
      status,
    }),
    {
      status,
      headers: { "content-type": "application/problem+json; charset=utf-8" },
    }
  );
}
