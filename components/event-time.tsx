"use client";

import { useEffect, useState } from "react";

/**
 * Renders an instant in the reader's own timezone. The server has no idea
 * where the reader is, so it renders a UTC fallback and the browser corrects
 * it once mounted. An admin who typed a local time must see that same local
 * time back, otherwise the round trip looks right and means the wrong thing.
 */
export function EventTime({ iso, locale }: { iso: string; locale: string }) {
  // The fallback has to be identical on the server and on the client, so it
  // is always rendered in UTC.
  const [text, setText] = useState(() => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  });

  useEffect(() => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    setText(date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }));
  }, [iso, locale]);

  return <>{text}</>;
}
