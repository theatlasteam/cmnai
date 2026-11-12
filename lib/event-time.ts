/**
 * Time helpers for events. They live apart from the event domain module so
 * client components can use them without pulling in the database bindings.
 */

/**
 * Converts a `datetime-local` wall-clock value into the absolute instant it
 * means. The picker has no timezone, so only the browser can resolve it: a
 * value typed in Moscow is three hours behind the same value typed in UTC.
 */
export function localStartToInstant(localValue: string): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Reads the start of an event from a submitted form. The browser sends the
 * absolute instant; the local wall-clock value is only a fallback for a form
 * submitted before the browser could resolve it.
 */
export function parseEventStart(formData: FormData): string {
  const instant = String(formData.get("startsAt") ?? "").trim();
  if (instant) {
    const parsed = new Date(instant);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return String(formData.get("startsAtLocal") ?? "").trim();
}

/**
 * Renders an instant as a `datetime-local` wall-clock value in the reader's
 * own timezone, so the picker shows the same time the reader entered.
 */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
