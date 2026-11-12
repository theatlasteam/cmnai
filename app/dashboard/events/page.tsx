import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { List, ListItem } from "@astryxdesign/core/List";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Link } from "@astryxdesign/core/Link";
import { BookOpen, Clock, Key, Sparkles } from "geist-icons";
import { dictionaries, getLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site";
import {
  eventModelList,
  isEventLive,
  isEventUpcoming,
  listEvents,
  sharedQuotaRemaining,
} from "@/lib/events";
import { EventTime } from "@/components/event-time";

/** Human countdown to the end of a window, in the visitor's language. */
function timeLeftLabel(endsAt: string, locale: string): string {
  const hours = Math.round((Date.parse(endsAt) - Date.now()) / (60 * 60 * 1000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export default async function DashboardEventsPage() {
  const [, locale] = await Promise.all([requireUser(), getLocale()]);
  const t = dictionaries[locale];
  const copy = t.events;
  const siteUrl = await getSiteUrl();
  const apiBase = `${siteUrl}/v1`;

  const events = await listEvents();
  const live = events.find((event) => isEventLive(event));
  const upcoming = events.find((event) => isEventUpcoming(event));
  const current = live ?? upcoming ?? null;

  const number = new Intl.NumberFormat(locale);
  const remaining = current ? sharedQuotaRemaining(current) : null;
  const used = current?.tokens_used ?? 0;
  const quota = current?.quota_tokens ?? 0;
  const models = current ? eventModelList(current) : [];
  const model = models[0] ?? "";

  const curl = `curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model || "your-model"}","messages":[{"role":"user","content":"Hello!"}]}'`;

  return (
    <Section variant="transparent" padding={0} minHeight="100dvh" className="cmn-event">
      <VStack
        className="cmn-page"
        width="100%"
        maxWidth={1120}
        minHeight="100dvh"
        paddingInline={6}
        paddingBlock={10}
        gap={5}
        justify="center"
      >
        {current ? (
          <>
            <VStack gap={3} align="center" width="100%">
              <HStack gap={2} align="center" wrap="wrap" justify="center">
                <Sparkles size={20} />
                <Text type="label" color="secondary">
                  {live ? copy.live : copy.upcoming}
                </Text>
                {current.badge ? (
                  <Badge variant="success" label={current.badge} />
                ) : null}
              </HStack>

              <Heading
                level={1}
                type="display-1"
                justify="center"
                textWrap="balance"
              >
                {current.title}
              </Heading>

              {current.description ? (
                <Text
                  type="large"
                  color="secondary"
                  justify="center"
                  className="max-w-2xl"
                  textWrap="pretty"
                >
                  {current.description}
                </Text>
              ) : null}

              <HStack gap={3} align="center" wrap="wrap" justify="center">
                <Badge
                  variant="neutral"
                  label={
                    current.kind === "shared_quota"
                      ? copy.sharedQuota
                      : copy.freeWindow
                  }
                />
                <HStack gap={1} align="center">
                  <Clock size={14} />
                  <Text type="supporting" color="secondary">
                    {live ? (
                      <>
                        {copy.until} {timeLeftLabel(current.ends_at, locale)}
                      </>
                    ) : (
                      <>
                        {copy.startsAt}{" "}
                        <EventTime iso={current.starts_at} locale={locale} />
                      </>
                    )}
                  </Text>
                </HStack>
                {models.length > 0 ? (
                  <Text type="supporting" color="secondary">
                    {models.join(", ")}
                  </Text>
                ) : (
                  <Text type="supporting" color="secondary">
                    {copy.allModels}
                  </Text>
                )}
              </HStack>

              {remaining !== null && quota > 0 ? (
                <VStack gap={2} width="100%" maxWidth={520}>
                  <ProgressBar
                    label={copy.quota}
                    value={used}
                    max={quota}
                    variant="accent"
                    hasValueLabel
                  />
                  <Text type="supporting" color="secondary" justify="center">
                    {number.format(remaining)} {copy.tokensLeft}
                  </Text>
                </VStack>
              ) : null}
            </VStack>

            <Grid columns={{ minWidth: 320, max: 2 }} gap={4} width="100%">
              <Card padding={5}>
                <VStack gap={4} align="start" width="100%">
                  <Heading level={3}>{copy.howToUse}</Heading>
                  <List listStyle="decimal" density="balanced">
                    <ListItem label={copy.stepKey} />
                    <ListItem label={copy.stepBaseUrl} />
                    <ListItem label={copy.stepModel} />
                  </List>
                  <CodeBlock
                    code={curl}
                    language="bash"
                    title="curl"
                    hasCopyButton
                    isWrapped
                    width="100%"
                  />
                </VStack>
              </Card>

              <Card padding={5}>
                <VStack gap={4} align="start" width="100%">
                  <Heading level={3}>{copy.details}</Heading>
                  <MetadataList columns="single">
                    <MetadataListItem label={copy.baseUrl}>
                      <Text type="code">{apiBase}</Text>
                    </MetadataListItem>
                    <MetadataListItem label={copy.model}>
                      <Text type="code">{model || copy.allModels}</Text>
                    </MetadataListItem>
                    <MetadataListItem label={copy.endpoint}>
                      <Text type="code">POST /v1/chat/completions</Text>
                    </MetadataListItem>
                    <MetadataListItem label={copy.endsAt}>
                      <EventTime iso={current.ends_at} locale={locale} />
                    </MetadataListItem>
                  </MetadataList>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Button
                      variant="secondary"
                      label={copy.readDocs}
                      href="/docs"
                      icon={<BookOpen size={16} />}
                    />
                    <Button
                      variant="secondary"
                      label={copy.getKey}
                      href="/dashboard/keys"
                      icon={<Key size={16} />}
                    />
                  </HStack>
                </VStack>
              </Card>
            </Grid>

            <HStack gap={2} align="center" wrap="wrap" justify="center">
              <Button
                variant="primary"
                label={copy.joinCta}
                href="/dashboard/keys"
                icon={<Sparkles size={16} />}
              />
              <Button variant="secondary" label={copy.backToPool} href="/providers" />
            </HStack>
          </>
        ) : (
          <>
            <VStack gap={3} align="center" width="100%">
              <HStack gap={2} align="center" justify="center">
                <Sparkles size={20} />
                <Text type="label" color="secondary">
                  {copy.title}
                </Text>
              </HStack>
              <Heading
                level={1}
                type="display-1"
                justify="center"
                textWrap="balance"
              >
                {copy.nothingRunning}
              </Heading>
              <Text
                type="large"
                color="secondary"
                justify="center"
                className="max-w-2xl"
                textWrap="pretty"
              >
                {copy.nothingRunningBody}
              </Text>
              <Button variant="primary" label={copy.backToPool} href="/providers" />
            </VStack>
          </>
        )}

        <Text type="supporting" color="secondary" justify="center">
          <Link href="/dashboard">{copy.backToDashboard}</Link>
        </Text>
      </VStack>
    </Section>
  );
}
