"use client";

import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Check } from "geist-icons";
import { AdminEventsTable, type EventRow } from "@/components/admin-events-table";
import {
  EventEditor,
  type EventDraft,
  type PresetOption,
} from "@/components/event-editor";
import type { Dictionary } from "@/lib/i18n";

export type EditableEvent = {
  id: string;
  title: string;
  description: string;
  kind: "free_window" | "shared_quota";
  models: string;
  quota_tokens: number | null;
  duration_hours: number;
  starts_at: string;
  status: "draft" | "published" | "ended";
  badge: string | null;
};

/** `datetime-local` wants a local wall-clock value, not an ISO instant. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The events tab. It holds which event is being edited so the same editor
 * serves both creating and changing an event.
 */
export function AdminEventsPanel({
  rows,
  events,
  presets,
  modelOptions,
  copy,
}: {
  rows: EventRow[];
  events: EditableEvent[];
  presets: PresetOption[];
  modelOptions: string[];
  copy: Dictionary["events"];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = events.find((event) => event.id === editingId) ?? null;
  const draft: EventDraft | null = editing
    ? {
        id: editing.id,
        title: editing.title,
        description: editing.description,
        kind: editing.kind,
        models: editing.models,
        quotaTokens: editing.quota_tokens,
        durationHours: editing.duration_hours,
        startsAt: toLocalInputValue(editing.starts_at),
        badge: editing.badge ?? "",
        status: editing.status,
      }
    : null;

  return (
    <>
      <EventEditor
        key={editingId ?? "new"}
        presets={presets}
        draft={draft}
        modelOptions={modelOptions}
        copy={copy}
        onCancel={editing ? () => setEditingId(null) : undefined}
      />

      {rows.length > 0 ? (
        <Card padding={0}>
          <AdminEventsTable rows={rows} copy={copy} onEdit={setEditingId} />
        </Card>
      ) : (
        <EmptyState
          icon={<Check size={28} />}
          title={copy.emptyTitle}
          description={copy.emptyBody}
          isCompact
        />
      )}
    </>
  );
}
