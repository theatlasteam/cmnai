import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Table } from "@/components/data-table";
import { Text } from "@astryxdesign/core/Text";
import { ChartActivity, Clock, Gauge, Sparkles } from "geist-icons";
import { requireUser } from "@/lib/auth";
import { dictionaries, getLocale } from "@/lib/i18n";
import { rateLimitPerMinute } from "@/lib/limits";
import {
  usageByKey,
  usageByModel,
  usageDaily,
  usageToday,
  userUsage,
} from "@/lib/pool";


export default async function UsagePage() {
  const [locale, user] = await Promise.all([getLocale(), requireUser()]);
  const t = dictionaries[locale];
  const [today, allTime, daily, models, keys] = await Promise.all([
    usageToday(user.id),
    userUsage(user.id),
    usageDaily(user.id, 14),
    usageByModel(user.id, 30, 8),
    usageByKey(user.id, 30),
  ]);
  const rpm = rateLimitPerMinute();
  const number = new Intl.NumberFormat(locale);

  const percent = Math.min(100, Math.round((today.tokens / today.limit) * 100));
  const variant = percent >= 95 ? "error" : percent >= 75 ? "warning" : "success";
  const reset = new Date(today.resetAt).toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const peak = Math.max(1, ...daily.map((point) => point.tokens));

  const statCards = [
    {
      label: t.dash.usedToday,
      value: `${number.format(today.tokens)} / ${number.format(today.limit)}`,
      icon: <Sparkles size={18} />,
    },
    {
      label: t.dash.requestsToday,
      value: number.format(today.requests),
      icon: <ChartActivity size={18} />,
    },
    {
      label: t.dash.remainingToday,
      value: number.format(today.remaining),
      icon: <Gauge size={18} />,
    },
    {
      label: t.dash.allTimeRequests,
      value: number.format(allTime.requests),
      icon: <Clock size={18} />,
    },
  ];

  const modelRows = models.map((row) => ({
    model: row.model,
    provider: row.provider ?? "—",
    requests: number.format(row.requests),
    tokens: number.format(row.tokens),
    errors: number.format(row.errors),
  }));
  const modelColumns = [
    { key: "model", header: "Model" },
    { key: "provider", header: t.admin.provider },
    { key: "requests", header: t.dash.requests, align: "end" as const },
    { key: "tokens", header: t.dash.statTokens, align: "end" as const },
    { key: "errors", header: t.dash.errorCount, align: "end" as const },
  ];

  const keyRows = keys.map((row) => ({
    name: row.name,
    prefix: `${row.prefix}…`,
    requests: number.format(row.requests),
    tokens: number.format(row.tokens),
  }));
  const keyColumns = [
    { key: "name", header: t.dash.keyName },
    { key: "prefix", header: t.dash.prefix },
    { key: "requests", header: t.dash.requests, align: "end" as const },
    { key: "tokens", header: t.dash.statTokens, align: "end" as const },
  ];

  return (
    <>
      <VStack gap={1}>
        <Heading level={1}>{t.dash.usageTitle}</Heading>
        <Text type="body" color="secondary">
          {t.dash.usageSubtitle}
        </Text>
      </VStack>

      <Grid columns={{ minWidth: 200, max: 4 }} gap={4} width="100%">
        {statCards.map((stat) => (
          <Card key={stat.label} padding={4}>
            <VStack gap={2}>
              {stat.icon}
              <Heading level={2} className="tabular-nums">
                {stat.value}
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
              <Text type="label" color={today.isContributor ? "accent" : "secondary"}>
                {today.isContributor ? t.dash.contributorPlanLabel : t.dash.planLabel}
              </Text>
            </HStack>
            <ProgressBar
              value={today.tokens}
              max={today.limit}
              label={t.dash.dailyLimitLabel}
              hasValueLabel
              variant={variant}
            />
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                {number.format(today.tokens)} / {number.format(today.limit)}{" "}
                {t.dash.tokensShort} · {t.dash.resetsAt}: {reset}
              </Text>
              <Text type="supporting" color="secondary">
                {percent >= 100 ? t.dash.quotaExhausted : t.dash.quotaHealthy}
              </Text>
            </VStack>
          </VStack>
        </Card>

        <Card padding={5}>
          <VStack gap={3} align="start">
            <Heading level={2}>{t.dash.limitsTitle}</Heading>
            <HStack width="100%" justify="between" align="center" gap={2} wrap="wrap">
              <Text type="body">{t.dash.rateLimitLabel}</Text>
              <Text type="code">{rpm}</Text>
            </HStack>
            <HStack width="100%" justify="between" align="center" gap={2} wrap="wrap">
              <Text type="body">{t.dash.dailyLimitLabel}</Text>
              <Text type="code">{number.format(today.limit)}</Text>
            </HStack>
            <HStack width="100%" justify="between" align="center" gap={2} wrap="wrap">
              <Text type="body">{t.dash.allTimeTokens}</Text>
              <Text type="code">
                {number.format(allTime.prompt + allTime.completion)}
              </Text>
            </HStack>
            <Text type="supporting" color="secondary">
              {today.isContributor ? t.dash.contributorActive : t.dash.upgradeHint}
            </Text>
          </VStack>
        </Card>
      </Grid>

      <VStack gap={3}>
        <Heading level={2}>{t.dash.last14}</Heading>
        <Card padding={5}>
          <VStack gap={3} width="100%">
            {daily.map((point) => (
              <HStack key={point.day} gap={3} align="center" width="100%" wrap="wrap">
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {new Date(`${point.day}T00:00:00Z`).toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </Text>
                <VStack width="100%" maxWidth={420}>
                  <ProgressBar
                    value={point.tokens}
                    max={peak}
                    label={`${point.day} usage`}
                    isLabelHidden
                    variant={point.tokens > 0 ? "accent" : "neutral"}
                  />
                </VStack>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {number.format(point.tokens)} {t.dash.tokensShort} ·{" "}
                  {number.format(point.requests)} {t.dash.requests.toLowerCase()}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{t.dash.models30}</Heading>
        {modelRows.length > 0 ? (
          <Card padding={0}>
            <Table data={modelRows} columns={modelColumns} />
          </Card>
        ) : (
          <Card padding={5}>
            <Text type="body" color="secondary">
              {t.dash.noUsage}
            </Text>
          </Card>
        )}
      </VStack>

      {keyRows.length > 0 ? (
        <VStack gap={3}>
          <Heading level={2}>{t.dash.keys30}</Heading>
          <Card padding={0}>
            <Table data={keyRows} columns={keyColumns} />
          </Card>
        </VStack>
      ) : null}
    </>
  );
}
