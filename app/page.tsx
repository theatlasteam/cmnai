import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Section } from "@astryxdesign/core/Section";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table } from "@/components/data-table";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Divider } from "@astryxdesign/core/Divider";
import {
  ArrowRight,
  ChartActivity,
  Clock,
  Globe,
  Key,
  Layers,
  Servers,
  ShieldCheck,
  Sparkles,
  Users,
} from "geist-icons";
import { getLocale, dictionaries } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";
import { listPublicPool, poolStats } from "@/lib/pool";
import { getSiteUrl } from "@/lib/site";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { PageShell } from "@/components/page-shell";
import {
  listPublicEvents,
  sharedQuotaRemaining,
} from "@/lib/events";



export default async function Home() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  const t = dictionaries[locale];
  const [stats, models, events] = await Promise.all([
    poolStats(),
    listPublicPool(),
    listPublicEvents(),
  ]);
  const apiBase = `${await getSiteUrl()}/v1`;
  const curlExample = `curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello from cmnAI" }]
  }'`;

  const tableData = models.map((model) => ({
    id: model.id,
    display_name: model.display_name,
    provider: model.provider,
    context: model.context_window
      ? new Intl.NumberFormat(locale).format(model.context_window)
      : "—",
  }));
  const columns = [
    { key: "id", header: "Model" },
    { key: "display_name", header: "Name" },
    { key: "provider", header: "Contributed by" },
    { key: "context", header: "Context", align: "end" as const },
  ];

  return (
    <PageShell topNav={<SiteHeader t={t} locale={locale} user={user} />}>

      <Section className="cmn-hero" variant="transparent" padding={0}>
          <VStack
            className="cmn-hero-inner"
            width="100%"
            maxWidth={1120}
            paddingInline={6}
            paddingBlock={10}
            gap={6}
            align="start"
          >
            <HStack className="cmn-hero-eyebrow" gap={2} align="center">
              <StatusDot className="cmn-pulse" variant="success" label={t.landing.badge} />
              <Text type="supporting" color="secondary">{t.landing.badge}</Text>
            </HStack>

            <Heading level={1} className="cmn-hero-title">
              {t.landing.title}
            </Heading>
            <Text as="p" type="large" color="secondary" className="cmn-hero-sub">{t.landing.subtitle}</Text>

            <HStack gap={4} wrap="wrap" align="center">
              <Button
                variant="primary"
                size="lg"
                label={t.landing.ctaPrimary}
                href="/signup"
                icon={<Key size={18} />}
              />
              <a href="#pool" className="cmn-hero-link">
                {t.landing.ctaSecondary}
                <ArrowRight size={14} />
              </a>
            </HStack>

            <Grid className="cmn-stat-strip" columns={{ minWidth: 120, max: 4 }} gap={4} width="100%">
              {[
                { value: stats.endpoints, label: t.landing.statEndpoints },
                { value: stats.models, label: t.landing.statModels },
                { value: stats.requests, label: t.landing.statRequests },
                { value: stats.contributors, label: t.landing.statContributors },
              ].map((stat) => (
                <VStack className="cmn-stat" key={stat.label} gap={0}>
                  <Text className="cmn-stat-value" type="display-3" hasTabularNumbers>
                    {new Intl.NumberFormat(locale).format(stat.value)}
                  </Text>
                  <Text className="cmn-stat-label" type="supporting" color="secondary">{stat.label}</Text>
                </VStack>
              ))}
            </Grid>
          </VStack>
      </Section>

      <Section id="how" variant="muted" padding={0}>
        <VStack className="cmn-page" maxWidth={1120} width="100%" paddingInline={6} paddingBlock={10} gap={6}>
          <VStack gap={2}>
            <Heading level={2}>{t.landing.howTitle}</Heading>
            <Text type="body" color="secondary" className="max-w-2xl">
              {t.landing.howSubtitle}
            </Text>
          </VStack>
          <Grid columns={{ minWidth: 260, max: 3 }} gap={4} width="100%">
            {[
              {
                icon: <Users size={20} />,
                title: t.landing.step1Title,
                body: t.landing.step1Body,
                n: "01",
              },
              {
                icon: <ShieldCheck size={20} />,
                title: t.landing.step2Title,
                body: t.landing.step2Body,
                n: "02",
              },
              {
                icon: <ChartActivity size={20} />,
                title: t.landing.step3Title,
                body: t.landing.step3Body,
                n: "03",
              },
            ].map((step) => (
              <Card key={step.n} padding={5} elevation="low">
                <VStack gap={3} align="start">
                  <HStack width="100%" justify="between" align="center">
                    <Badge variant="blue" icon={step.icon} label={step.n} />
                  </HStack>
                  <Heading level={3}>{step.title}</Heading>
                  <Text type="body" color="secondary">
                    {step.body}
                  </Text>
                </VStack>
              </Card>
            ))}
          </Grid>

          <Card padding={5}>
            <VStack gap={3} align="start">
              <Heading level={3}>{t.dash.quickstart}</Heading>
              <Text type="supporting" color="secondary">
                {t.dash.quickstartBody}
              </Text>
              <CodeBlock
                code={curlExample}
                language="bash"
                title="curl"
                hasCopyButton
                isWrapped
                width="100%"
              />
            </VStack>
          </Card>
        </VStack>
      </Section>

      {events.length > 0 ? (
        <Section variant="transparent" padding={0}>
          <VStack
            id="events"
            className="cmn-page"
            maxWidth={1120}
            width="100%"
            paddingInline={6}
            paddingBlock={10}
            gap={5}
          >
            <VStack gap={2}>
              <Heading level={2}>{t.events.title}</Heading>
              <Text type="body" color="secondary" className="max-w-2xl">
                {t.events.publicSubtitle}
              </Text>
            </VStack>

            <Grid columns={{ minWidth: 280, max: 3 }} gap={4} width="100%">
              {events.map((event) => {
                const remaining = sharedQuotaRemaining(event);
                return (
                  <Card key={event.id} padding={5}>
                    <VStack gap={3} align="start">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Sparkles size={18} />
                        <Heading level={3}>{event.title}</Heading>
                        {event.badge ? (
                          <Badge variant="success" label={event.badge} />
                        ) : null}
                      </HStack>
                      {event.description ? (
                        <Text type="body" color="secondary">
                          {event.description}
                        </Text>
                      ) : null}
                      <HStack gap={3} align="center" wrap="wrap">
                        <Badge
                          variant="neutral"
                          label={
                            event.kind === "shared_quota"
                              ? t.events.sharedQuota
                              : t.events.freeWindow
                          }
                        />
                        <HStack gap={1} align="center">
                          <Clock size={14} />
                          <Text type="supporting" color="secondary">
                            {t.events.until}{" "}
                            {new Date(event.ends_at).toLocaleString(locale)}
                          </Text>
                        </HStack>
                      </HStack>
                      {remaining !== null ? (
                        <Text type="supporting" color="secondary">
                          {new Intl.NumberFormat(locale).format(remaining)}{" "}
                          {t.events.tokensLeft}
                        </Text>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        label={t.events.seeEvent}
                        href="/dashboard/events"
                        icon={<ArrowRight size={14} />}
                      />
                    </VStack>
                  </Card>
                );
              })}
            </Grid>
          </VStack>
        </Section>
      ) : null}

      <Section variant="transparent" padding={0}>
        <VStack
          id="pool"
          className="cmn-page"
          maxWidth={1120}
          width="100%"
          paddingInline={6}
          paddingBlock={10}
          gap={5}
        >
          <VStack gap={2}>
            <Heading level={2}>{t.landing.poolTitle}</Heading>
            <Text type="body" color="secondary" className="max-w-2xl">
              {t.landing.poolSubtitle}
            </Text>
          </VStack>

          {tableData.length > 0 ? (
            <Card className="cmn-pool-frame" padding={0} width="100%">
              <HStack className="cmn-pool-bar" gap={3} justify="between" align="center" wrap="wrap">
                <HStack gap={2} align="center">
                  <StatusDot variant="success" label={t.common.status.active} />
                  <Text type="code" color="secondary">live pool · {tableData.length} models</Text>
                </HStack>
                <Text type="code" color="secondary">/v1/models</Text>
              </HStack>
              <Table data={tableData} columns={columns} />
            </Card>
          ) : (
            <EmptyState
              title={t.landing.poolEmpty}
              actions={
                <Button label={t.landing.contributeCta} href="/signup" variant="primary" />
              }
            />
          )}
        </VStack>
      </Section>

      <Section variant="muted" padding={0}>
        <VStack className="cmn-page" maxWidth={1120} width="100%" paddingInline={6} paddingBlock={10} gap={6}>
          <Heading level={2}>{t.landing.whyTitle}</Heading>
          <Grid columns={{ minWidth: 260, max: 2 }} gap={4} width="100%">
            {[
              { icon: <Globe size={18} />, title: t.landing.why1Title, body: t.landing.why1Body },
              { icon: <ShieldCheck size={18} />, title: t.landing.why2Title, body: t.landing.why2Body },
              { icon: <Users size={18} />, title: t.landing.why3Title, body: t.landing.why3Body },
              { icon: <Layers size={18} />, title: t.landing.why4Title, body: t.landing.why4Body },
            ].map((item) => (
              <Card key={item.title} padding={5}>
                <VStack gap={2} align="start">
                  {item.icon}
                  <Heading level={3}>{item.title}</Heading>
                  <Text type="body" color="secondary">
                    {item.body}
                  </Text>
                </VStack>
              </Card>
            ))}
          </Grid>
        </VStack>
      </Section>

      <Section variant="transparent" padding={0}>
        <VStack className="cmn-page" maxWidth={1120} width="100%" paddingInline={6} paddingBlock={10}>
          <Card padding={6}>
            <VStack gap={4} align="start">
              <Heading level={2}>{t.landing.contributeTitle}</Heading>
              <Text type="body" color="secondary" className="max-w-2xl">
                {t.landing.contributeBody}
              </Text>
              <Button
                variant="primary"
                size="lg"
                label={t.landing.contributeCta}
                href="/dashboard/endpoints"
                icon={<Servers size={18} />}
              />
            </VStack>
          </Card>
        </VStack>
      </Section>

      <Divider />
      <Section variant="muted" padding={0}>
        <VStack className="cmn-page" maxWidth={1120} width="100%" paddingInline={6} paddingBlock={6}>
          <HStack width="100%" justify="between" align="center" wrap="wrap" gap={3}>
            <Text type="supporting" color="secondary">
              {t.landing.footer}
            </Text>
            <HStack gap={4} align="center" wrap="wrap">
              <Text type="supporting" color="secondary">
                OpenAI-compatible · /v1/chat/completions
              </Text>
              <StatusBadge status="active" t={t} />
            </HStack>
          </HStack>
        </VStack>
      </Section>
    </PageShell>
  );
}
