"use client";

import { useActionState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@/components/form-fields";
import { Table, pixel } from "@astryxdesign/core/Table";
import { Key, Plus, Trash } from "geist-icons";
import {
  createKeyAction,
  revokeKeyAction,
  type ActionState,
} from "@/app/actions/keys";
import type { ApiKeyRow } from "@/lib/auth";
import type { Dictionary } from "@/lib/i18n";
import { CopyRow } from "./copy-button";

export function KeyManager({
  t,
  keys,
  locale,
}: {
  t: Dictionary;
  keys: ApiKeyRow[];
  locale: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createKeyAction,
    {},
  );

  const rows = keys.map((key) => ({ ...key }));
  const columns = [
    {
      key: "name",
      header: t.dash.keyName,
      renderCell: (row: Record<string, unknown>) => (
        <HStack gap={2} align="center">
          <Key size={16} />
          <Text type="body" weight="medium">
            {String(row.name)}
          </Text>
        </HStack>
      ),
    },
    {
      key: "prefix",
      header: t.dash.prefix,
      renderCell: (row: Record<string, unknown>) => (
        <Text type="code">{String(row.prefix)}…</Text>
      ),
    },
    {
      key: "requests",
      header: t.dash.requests,
      align: "end" as const,
      renderCell: (row: Record<string, unknown>) =>
        new Intl.NumberFormat(locale).format(Number(row.requests)),
    },
    {
      key: "last_used_at",
      header: t.dash.lastUsed,
      renderCell: (row: Record<string, unknown>) =>
        row.last_used_at
          ? new Date(String(row.last_used_at)).toLocaleDateString(locale)
          : t.dash.never,
    },
    {
      key: "created_at",
      header: t.dash.created,
      renderCell: (row: Record<string, unknown>) =>
        new Date(String(row.created_at)).toLocaleDateString(locale),
    },
    {
      key: "actions",
      header: "",
      width: pixel(90),
      renderCell: (row: Record<string, unknown>) => (
        <form action={revokeKeyAction}>
          <input type="hidden" name="keyId" value={String(row.id)} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            isIconOnly
            label={t.dash.revoke}
            icon={<Trash size={16} />}
          />
        </form>
      ),
    },
  ];

  return (
    <VStack gap={6} width="100%">
      <VStack gap={1}>
        <Heading level={1}>{t.dash.keysTitle}</Heading>
        <Text type="body" color="secondary">
          {t.dash.keysSubtitle}
        </Text>
      </VStack>

      {state.success ? (
        <Card padding={5} variant="green">
          <VStack gap={3}>
            <Heading level={3}>{t.dash.newKeyTitle}</Heading>
            <Text type="body">{t.dash.newKeyBody}</Text>
            <CopyRow
              value={state.success}
              label={t.landing.copy}
              copiedLabel={t.landing.copied}
            />
          </VStack>
        </Card>
      ) : null}

      <Card padding={5}>
        <form action={formAction}>
          <HStack gap={3} align="end" wrap="wrap">
            <VStack gap={2} width="100%" maxWidth={360}>
              <TextInput
                label={t.dash.keyName}
                htmlName="name"
                placeholder="Laptop CLI"
                isRequired
              />
            </VStack>
            <Button
              type="submit"
              variant="primary"
              isLoading={pending}
              label={t.dash.createKey}
              icon={<Plus size={16} />}
            />
          </HStack>
        </form>
        {state.error ? (
          <VStack paddingBlockStart={3}>
            <Banner status="error" title={state.error} />
          </VStack>
        ) : null}
      </Card>

      {rows.length > 0 ? (
        <Card padding={0}>
          <Table data={rows} columns={columns} />
        </Card>
      ) : (
        <Banner status="info" title={t.dash.noKeys} />
      )}
    </VStack>
  );
}
