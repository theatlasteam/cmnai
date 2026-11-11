"use client";

import { useActionState, useState, useTransition } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@/components/form-fields";
import { TextArea } from "@/components/form-fields";
import { SelectField } from "@/components/select-field";
import { Table, pixel } from "@astryxdesign/core/Table";
import { RefreshClockwise, Serverless, ShieldCheck, Trash } from "geist-icons";
import {
  removeOwnEndpointAction,
  submitEndpointAction,
  type ActionState,
} from "@/app/actions/keys";
import { refreshCaptchaAction } from "@/app/actions/auth";
import type { CaptchaChallenge } from "@/lib/captcha";
import type { Dictionary } from "@/lib/i18n";
import { StatusBadge } from "./status-badge";

type Endpoint = {
  id: string;
  name: string;
  base_url: string;
  api_mode: string;
  status: string;
  notes: string | null;
  created_at: string;
  model_count: number;
};

export function EndpointManager({
  t,
  locale,
  endpoints,
  captcha: initial,
  notice,
  providerKeys,
}: {
  t: Dictionary;
  locale: string;
  endpoints: Endpoint[];
  captcha: CaptchaChallenge;
  notice?: string;
  providerKeys: Array<{
    id: string;
    provider_name: string;
    status: string;
    last_checked_at: string | null;
    error: string | null;
  }>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    submitEndpointAction,
    {},
  );
  const [captcha, setCaptcha] = useState(initial);
  const [, startRefresh] = useTransition();

  function refresh() {
    startRefresh(async () => {
      setCaptcha(await refreshCaptchaAction());
    });
  }

  const apiModeOptions = [
    { value: "chat_completions", label: t.dash.apiModeChat },
    { value: "responses", label: t.dash.apiModeResponses },
    { value: "anthropic_messages", label: t.dash.apiModeAnthropic },
  ];
  const apiModeLabels: Record<string, string> = Object.fromEntries(
    apiModeOptions.map((option) => [option.value, option.label]),
  );

  const rows = endpoints.map((endpoint) => ({ ...endpoint }));
  const columns = [
    {
      key: "name",
      header: t.dash.providerName,
      renderCell: (row: Record<string, unknown>) => (
        <HStack gap={2} align="center">
          <Serverless size={16} />
          <Text type="body" weight="medium">
            {String(row.name)}
          </Text>
        </HStack>
      ),
    },
    {
      key: "base_url",
      header: t.dash.baseUrlShort,
      renderCell: (row: Record<string, unknown>) => (
        <Text type="code">{String(row.base_url).replace(/^https?:\/\//, "")}</Text>
      ),
    },
    {
      key: "api_mode",
      header: t.dash.apiMode,
      renderCell: (row: Record<string, unknown>) => (
        <Text type="supporting" color="secondary">
          {apiModeLabels[String(row.api_mode)] ?? t.dash.apiModeChat}
        </Text>
      ),
    },
    {
      key: "model_count",
      header: t.dash.modelsShort,
      align: "end" as const,
    },
    {
      key: "status",
      header: t.dash.status,
      renderCell: (row: Record<string, unknown>) => (
        <StatusBadge status={String(row.status)} t={t} />
      ),
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
      width: pixel(70),
      renderCell: (row: Record<string, unknown>) =>
        row.status === "approved" ? null : (
          <form action={removeOwnEndpointAction}>
            <input type="hidden" name="providerId" value={String(row.id)} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              isIconOnly
              label={t.dash.cancel}
              icon={<Trash size={16} />}
            />
          </form>
        ),
    },
  ];

  return (
    <VStack gap={6} width="100%">
      <VStack gap={1}>
        <Heading level={1}>{t.dash.endpointsTitle}</Heading>
        <Text type="body" color="secondary">
          {t.dash.endpointsSubtitle}
        </Text>
      </VStack>

      {notice === "verified" ? (
        <Banner status="success" title={t.providers.submittedVerified} />
      ) : null}
      {notice === "unverified" ? (
        <Banner status="warning" title={t.providers.submittedUnverified} />
      ) : null}

      <Card padding={5}>
        <VStack gap={4}>
          <HStack gap={2} align="center">
            <ShieldCheck size={18} />
            <Heading level={3}>{t.landing.contributeCta}</Heading>
          </HStack>

          <form action={formAction}>
            <VStack gap={4}>
              <input type="hidden" name="captchaId" value={captcha.id} />
              {state.error ? <Banner status="error" title={state.error} /> : null}

              <FormLayout>
                <TextInput
                  label={t.dash.providerName}
                  htmlName="name"
                  placeholder="Northern Lights inference"
                  isRequired
                />
                <TextInput
                  label={t.dash.baseUrl}
                  type="url"
                  htmlName="baseUrl"
                  placeholder="https://api.example.com/v1"
                  description="OpenAI-compatible base URL, without /chat/completions."
                  isRequired
                />
                <SelectField
                  label={t.dash.apiMode}
                  htmlName="apiMode"
                  defaultValue="chat_completions"
                  options={apiModeOptions}
                  description={t.dash.apiModeHint}
                  isRequired
                />
                <TextInput
                  label={t.dash.apiKey}
                  type="password"
                  htmlName="apiKey"
                  description={t.dash.apiKeyHint}
                  isRequired
                />
                <TextInput
                  label={t.dash.models}
                  htmlName="models"
                  placeholder="gpt-4o-mini, llama-3.1-70b"
                  description={t.dash.modelsHint}
                  isRequired
                />
                <TextInput
                  label={t.dash.contact}
                  htmlName="contact"
                  placeholder="matrix:@you:server"
                />
                <TextArea
                  label={t.dash.notes}
                  htmlName="notes"
                  rows={3}
                  placeholder="Uptime, GPU type, rate limits, region…"
                />
              </FormLayout>

              <HStack justify="between" align="center" gap={3} wrap="wrap">
                <VStack gap={2}>
                  <Text type="label">{t.auth.captcha}</Text>
                  <div className="cmn-captcha">
                    <img
                      key={captcha.id}
                      src={captcha.imageUrl}
                      alt={t.auth.captcha}
                      width={240}
                      height={80}
                      className="cmn-captcha-image"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      label={t.auth.refresh}
                      isIconOnly
                      icon={<RefreshClockwise size={16} />}
                      onClick={refresh}
                    />
                  </div>
                  <TextInput label="Answer" htmlName="captchaAnswer" isRequired />
                </VStack>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={pending}
                  label={t.dash.submit}
                  icon={<Serverless size={16} />}
                />
              </HStack>
            </VStack>
          </form>
        </VStack>
      </Card>

      <VStack gap={3}>
        <HStack width="100%" justify="between" align="center" wrap="wrap" gap={2}>
          <Heading level={2}>{t.providers.myKeys}</Heading>
          <Button
            variant="secondary"
            size="sm"
            label={t.providers.addKey}
            href="/providers"
          />
        </HStack>
        {providerKeys.length > 0 ? (
          <Card padding={0}>
            <Table
              data={providerKeys}
              columns={[
                { key: "provider_name", header: t.admin.provider },
                {
                  key: "status",
                  header: t.dash.status,
                  renderCell: (row) => (
                    <StatusBadge status={String(row.status)} t={t} />
                  ),
                },
                {
                  key: "last_checked_at",
                  header: t.providers.checked,
                  renderCell: (row) =>
                    row.last_checked_at
                      ? new Date(String(row.last_checked_at)).toLocaleString(locale)
                      : "—",
                },
                {
                  key: "error",
                  header: t.admin.reviewNote,
                  renderCell: (row) => String(row.error ?? "—"),
                },
              ]}
            />
          </Card>
        ) : (
          <Banner status="info" title={t.providers.myKeysEmpty} />
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{t.dash.mySubmissions}</Heading>
        {rows.length > 0 ? (
          <Card padding={0}>
            <Table data={rows} columns={columns} />
          </Card>
        ) : (
          <Banner status="info" title={t.dash.noSubmissions} />
        )}
      </VStack>
    </VStack>
  );
}
