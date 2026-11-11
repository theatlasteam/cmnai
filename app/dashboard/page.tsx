import { cookies } from "next/headers";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Table } from "@astryxdesign/core/Table";
import { Button } from "@astryxdesign/core/Button";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { ChartActivity, Key, Servers, Sparkles } from "geist-icons";
import { listApiKeys, requireUser } from "@/lib/auth";
import { dictionaries, getLocale } from "@/lib/i18n";
import { recentUsage, usageToday, userUsage } from "@/lib/pool";
import { rateLimitPerMinute } from "@/lib/limits";
import { getSiteUrl } from "@/lib/site";
import { CopyRow } from "@/components/copy-button";
import { all } from "@/lib/db";



export default async function DashboardPage() {
  const [locale, user, cookieStore] = await Promise.all([
    getLocale(),
    requireUser(),
    cookies(),
  ]);
  const t = dictionaries[locale];
  const apiBase = `${await getSiteUrl()}/v1`;
  const newKey = cookieStore.get("cmnai_newkey")?.value;
  const [usage, today, allKeys, endpointRows, recent] = await Promise.all([
    userUsage(user.id),
    usageToday(user.id),
    listApiKeys(user.id),
    all<{ c: number }>(
      "SELECT COUNT(*) AS c FROM providers WHERE user_id = ?",
      user.id,
    ),
    recentUsage(user.id, 6),
  ]);
  const rpmLimit = rateLimitPerMinute();
  const keys = allKeys.filter((key) => !key.revoked_at);
  const endpoints = endpointRows[0];

  const totals: Record<string, number | string> = {
    requests: usage.requests,
    tokens: usage.prompt + usage.completion,
    keys: keys.length,
    endpoints: endpoints?.c ?? 0,
  };
  const todayPercent = Math.min(100, Math.round((today.tokens / today.limit) * 100));
  const quotaVariant =
    todayPercent >= 95 ? "error" : todayPercent >= 75 ? "warning" : "success";
  const resetTime = new Date(today.resetAt).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const statCards = [
    { label: t.dash.statRequests, value: totals.requests, icon: <ChartActivity size={18} /> },
    { label: t.dash.statTokens, value: totals.tokens, icon: <Sparkles size={18} /> },
    { label: t.dash.statKeys, value: totals.keys, icon: <Key size={18} /> },
    { label: t.dash.statEndpoints, value: totals.endpoints, icon: <Servers size={18} /> },
  ];

  const recentData = recent.map((row) => ({
    model: row.model,
    provider: row.provider_name ?? "—",
    tokens: new Intl.NumberFormat(locale).format(
      row.prompt_tokens + row.completion_tokens,
    ),
    status: row.status,
    when: new Date(row.created_at).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }),
  }));
  const columns = [
    { key: "model", header: "Model" },
    { key: "provider", header: "Provider" },
    { key: "tokens", header: "Tokens", align: "end" as const },
    { key: "status", header: "Status" },
    { key: "when", header: "When" },
  ];

  return (
    <>
      <VStack gap={1}>
        <Heading level={1}>{t.dash.welcome}, {user.name.split(" ")[0]}</Heading>
        <Text type="body" color="secondary">
          {t.tagline}
        </Text>
      </VStack>

      {newKey ? (
        <Card padding={5} variant="green">
          <VStack gap={3}>
            <HStack gap={2} align="center">
              <Key size={18} />
              <Heading level={3}>{t.dash.newKeyTitle}</Heading>
            </HStack>
            <Text type="body">{t.dash.newKeyBody}</Text>
            <CopyRow value={newKey} label={t.landing.copy} copiedLabel={t.landing.copied} />
          </VStack>
        </Card>
      ) : null}

      <Grid columns={{ minWidth: 180, max: 4 }} gap={4} width="100%">
        {statCards.map((stat) => (
          <Card key={stat.label} padding={4}>
            <VStack gap={2}>
              {stat.icon}
              <Heading level={2} className="tabular-nums">
                {new Intl.NumberFormat(locale).format(Number(stat.value))}
              </Heading>
              <Text type="supporting" color="secondary">
                {stat.label}
              </Text>
            </VStack>
          </Card>
        ))}
      </Grid>

      <Grid columns={{ minWidth: 300, max: 2 }} gap={4} width="100%">
        <Card padding={5}>
          <VStack gap={4} align="start">
            <HStack width="100%" justify="between" align="center" wrap="wrap" gap={2}>
              <Heading level={2}>{t.dash.usedToday}</Heading>
              <Badge variant="neutral" label={t.dash.planLabel} />
            </HStack>
            <Heading level={2} className="tabular-nums">
              {new Intl.NumberFormat(locale).format(today.tokens)}{" "}
              <Text type="supporting" color="secondary">
                / {new Intl.NumberFormat(locale).format(today.limit)}
              </Text>
            </Heading>
            <ProgressBar
              value={today.tokens}
              max={today.limit}
              label={t.dash.dailyLimitLabel}
              hasValueLabel
              variant={quotaVariant}
            />
            <Text type="supporting" color="secondary">
              {new Intl.NumberFormat(locale).format(today.remaining)} {t.dash.tokensShort} ·{" "}
              {t.dash.resetsAt} {resetTime}
            </Text>
            <HStack gap={2} wrap="wrap">
              <Button
                variant="secondary"
                size="sm"
                label={t.dash.viewUsage}
                href="/dashboard/usage"
              />
              <Button variant="ghost" size="sm" label={t.dash.docs} href="/docs" />
            </HStack>
          </VStack>
        </Card>

        <Card padding={5}>
          <VStack gap={4} align="start">
            <Heading level={2}>{t.dash.limitsTitle}</Heading>
            <Text type="supporting" color="secondary">
              {t.dash.limitsSubtitle}
            </Text>
            <HStack width="100%" justify="between" align="center">
              <Text type="body">{t.dash.rateLimitLabel}</Text>
              <Text type="code">{rpmLimit}/min</Text>
            </HStack>
            <HStack width="100%" justify="between" align="center">
              <Text type="body">{t.dash.dailyLimitLabel}</Text>
              <Text type="code">{new Intl.NumberFormat(locale).format(today.limit)}</Text>
            </HStack>
            <Text type="supporting" color="secondary">
              {t.dash.upgradeHint}
            </Text>
            <Button
              variant="secondary"
              size="sm"
              label={t.dash.endpoints}
              href="/dashboard/endpoints"
            />
          </VStack>
        </Card>
      </Grid>

      <Card padding={5}>
        <VStack gap={3} align="start">
          <Heading level={2}>{t.dash.quickstart}</Heading>
          <Text type="supporting" color="secondary">
            {t.dash.quickstartBody}
          </Text>
          <CodeBlock
            code={`curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hi"}]}'`}
            language="bash"
            hasCopyButton
            isWrapped
            width="100%"
          />
          <HStack gap={2}>
            <Button variant="secondary" size="sm" label={t.dash.keys} href="/dashboard/keys" />
            <Button variant="ghost" size="sm" label={t.docs.title} href="/docs" />
          </HStack>
        </VStack>
      </Card>

      <VStack gap={3}>
        <Heading level={2}>{t.dash.statRequests}</Heading>
        {recentData.length > 0 ? (
          <Card padding={0}>
            <Table data={recentData} columns={columns} />
          </Card>
        ) : (
          <Banner status="info" title={t.dash.noKeys} description={t.dash.quickstartBody} />
        )}
      </VStack>
    </>
  );
}
