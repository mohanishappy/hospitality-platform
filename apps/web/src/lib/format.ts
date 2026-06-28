export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function defaultStayDates(): { checkIn: string; checkOut: string } {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 14);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 3);
  return {
    checkIn: toDateInput(checkIn),
    checkOut: toDateInput(checkOut),
  };
}

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Half-open [from, to) covering one calendar month (month is 0-indexed). */
export function monthRange(
  year: number,
  month: number
): { from: string; to: string; label: string } {
  const fromDate = new Date(year, month, 1);
  const toDate = new Date(year, month + 1, 1);
  const label = fromDate.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  return { from: toDateInput(fromDate), to: toDateInput(toDate), label };
}

/** Sunday-start grid cells for a month; null = padding. */
export function calendarGridCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
