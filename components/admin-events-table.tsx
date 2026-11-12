"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Pause, Pencil, Play, Trash } from "geist-icons";
import { Table } from "@/components/data-table";
import {
  deleteEventAction,
  setEventStatusAction,
} from "@/app/actions/events";
import type { Dictionary } from "@/lib/i18n";
import { EventTime } from "@/components/event-time";

export type EventRow = {
  id: string;
  title: string;
  description: string;
  kind: string;
  status: string;
  models: string;
  budget: string;
  startsAt: string;
  endsAt: string;
  live: boolean;
};

/**
 * Event rows are rendered here because the table cells carry buttons and
 * badges, which cannot cross the server/client boundary.
 */
export function AdminEventsTable({
  rows,
  copy,
  locale,
  onEdit,
}: {
  rows: EventRow[];
  copy: Dictionary["events"];
  locale: string;
  onEdit?: (id: string) => void;
}) {
  return (
    <Table
      data={rows}
      columns={[
        {
          key: "title",
          header: copy.tableEvent,
          renderCell: (row) => (
            <VStack gap={1} align="start">
              <HStack gap={2} align="center" wrap="wrap">
                <Text type="body" weight="medium">
                  {String(row.title)}
                </Text>
                {row.live ? (
                  <Badge variant="success" label={copy.live} />
                ) : null}
              </HStack>
              {row.description ? (
                <Text type="supporting" color="secondary">
                  {String(row.description)}
                </Text>
              ) : null}
            </VStack>
          ),
        },
        { key: "kind", header: copy.tableKind },
        { key: "status", header: copy.tableStatus },
        { key: "models", header: copy.tableModels },
        { key: "budget", header: copy.tableBudget, align: "end" as const },
        {
          key: "window",
          header: copy.tableWindow,
          renderCell: (row) => (
            <VStack gap={1} align="start">
              <Text type="supporting" color="secondary">
                <EventTime iso={String(row.startsAt)} locale={locale} />
              </Text>
              <Text type="supporting" color="secondary">
                <EventTime iso={String(row.endsAt)} locale={locale} />
              </Text>
            </VStack>
          ),
        },
        {
          key: "actions",
          header: "",
          renderCell: (row) => (
            <HStack gap={1} align="center" wrap="wrap">
              {onEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  label={copy.edit}
                  icon={<Pencil size={14} />}
                  onClick={() => onEdit(String(row.id))}
                />
              ) : null}
              {row.live ? (
                <form action={setEventStatusAction}>
                  <input type="hidden" name="eventId" value={String(row.id)} />
                  <input type="hidden" name="status" value="ended" />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    label={copy.end}
                    icon={<Pause size={14} />}
                  />
                </form>
              ) : (
                <form action={setEventStatusAction}>
                  <input type="hidden" name="eventId" value={String(row.id)} />
                  <input type="hidden" name="status" value="published" />
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    label={copy.publish}
                    icon={<Play size={14} />}
                  />
                </form>
              )}
              <form action={deleteEventAction}>
                <input type="hidden" name="eventId" value={String(row.id)} />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  label={copy.delete}
                  icon={<Trash size={14} />}
                />
              </form>
            </HStack>
          ),
        },
      ]}
    />
  );
}
