"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Table, pixel } from "@/components/data-table";
import { reviewModelAction, updateUserAction } from "@/app/actions/admin";
import type { Dictionary } from "@/lib/i18n";

export type PendingModelRow = {
  id: string;
  model_id: string;
  display_name: string;
  provider_name: string;
};

export function AdminPendingModelsTable({
  rows,
  t,
}: {
  rows: PendingModelRow[];
  t: Dictionary;
}) {
  return (
    <Table
      data={rows}
      columns={[
        {
          key: "model_id",
          header: t.admin.modelId,
          renderCell: (row) => <Text type="code">{String(row.model_id)}</Text>,
        },
        { key: "display_name", header: t.admin.model },
        { key: "provider_name", header: t.admin.provider },
        {
          key: "actions",
          header: t.admin.actions,
          width: pixel(220),
          renderCell: (row) => (
            <HStack gap={2}>
              <form action={reviewModelAction}>
                <input type="hidden" name="modelId" value={String(row.id)} />
                <input type="hidden" name="decision" value="approve" />
                <Button type="submit" size="sm" variant="secondary" label={t.admin.approve} />
              </form>
              <form action={reviewModelAction}>
                <input type="hidden" name="modelId" value={String(row.id)} />
                <input type="hidden" name="decision" value="reject" />
                <Button type="submit" size="sm" variant="destructive" label={t.admin.reject} />
              </form>
            </HStack>
          ),
        },
      ]}
    />
  );
}

export function AdminUsersTable({
  rows,
  t,
  locale,
}: {
  rows: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    keys: number;
    endpoints: number;
    requests_today: number;
    tokens_today: number;
    created_at: string;
  }>;
  t: Dictionary;
  locale: string;
}) {
  return (
    <Table
      data={rows}
      columns={[
        {
          key: "name",
          header: t.admin.user,
          renderCell: (row) => (
            <VStack gap={0.5} align="start">
              <Text type="body" weight="medium">
                {String(row.name)}
              </Text>
              <Text type="supporting" color="secondary">
                {String(row.email)}
              </Text>
            </VStack>
          ),
        },
        {
          key: "role",
          header: t.admin.role,
          renderCell: (row) => (
            <Badge
              variant={row.role === "admin" ? "purple" : "neutral"}
              label={String(row.role)}
            />
          ),
        },
        {
          key: "status",
          header: t.admin.status,
          renderCell: (row) => (
            <Badge
              variant={row.status === "active" ? "success" : "error"}
              label={String(row.status)}
            />
          ),
        },
        { key: "keys", header: "Keys", width: pixel(70) },
        { key: "endpoints", header: t.dash.statEndpoints, width: pixel(90) },
        {
          key: "requests_today",
          header: t.dash.requestsToday,
          width: pixel(90),
          renderCell: (row) =>
            new Intl.NumberFormat(locale).format(Number(row.requests_today)),
        },
        {
          key: "tokens_today",
          header: t.dash.usedToday,
          width: pixel(110),
          renderCell: (row) =>
            new Intl.NumberFormat(locale).format(Number(row.tokens_today)),
        },
        {
          key: "created_at",
          header: t.admin.joined,
          renderCell: (row) =>
            new Date(String(row.created_at)).toLocaleDateString(locale),
        },
        {
          key: "actions",
          header: t.admin.actions,
          width: pixel(280),
          renderCell: (row) => (
            <HStack gap={2} wrap="wrap">
              <form action={updateUserAction}>
                <input type="hidden" name="userId" value={String(row.id)} />
                <input
                  type="hidden"
                  name="decision"
                  value={row.status === "active" ? "suspend" : "activate"}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant={row.status === "active" ? "destructive" : "secondary"}
                  label={row.status === "active" ? t.admin.suspend : t.admin.activate}
                />
              </form>
              <form action={updateUserAction}>
                <input type="hidden" name="userId" value={String(row.id)} />
                <input
                  type="hidden"
                  name="decision"
                  value={row.role === "admin" ? "demote" : "promote"}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  label={row.role === "admin" ? t.admin.makeUser : t.admin.makeAdmin}
                />
              </form>
            </HStack>
          ),
        },
      ]}
    />
  );
}
