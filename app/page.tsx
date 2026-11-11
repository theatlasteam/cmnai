import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Section } from "@astryxdesign/core/Section";
import { Table } from "@astryxdesign/core/Table";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Divider } from "@astryxdesign/core/Divider";
import {
  ArrowRight,
  ChartActivity,
  Globe,
  Key,
  Layers,
  Servers,
  ShieldCheck,
  Users,
} from "geist-icons";
import { getLocale, dictionaries } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";
import { listPublicPool, poolStats } from "@/lib/pool";
import { getSiteUrl } from "@/lib/site";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";



export default async function Home() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  const t = dictionaries[locale];
  const [stats, models] = await Promise.all([poolStats(), listPublicPool()]);
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
    <VStack width="100%" gap={0} minHeight="100%" padding={0}>
      <SiteHeader t={t} locale={locale} user={user} />

      <Section variant="transparent" padding={0}>
        <div className="cmn-hero">
          <VStack
            className="cmn-hero-inner"
            width="100%"
            maxWidth={1120}
            paddingInline={6}
            paddingBlock={10}
            gap={6}
            align="start"
          >
            <span className="cmn-hero-eyebrow">
              <span className="cmn-pulse" />
              {t.landing.badge}
            </span>

            <Heading level={1} className="cmn-hero-title">
              {t.landing.title}
            </Heading>
            <p className="cmn-hero-sub">{t.landing.subtitle}</p>

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

            <div className="cmn-stat-strip">
              {[
                { value: stats.endpoints, label: t.landing.statEndpoints },
                { value: stats.models, label: t.landing.statModels },
                { value: stats.requests, label: t.landing.statRequests },
                { value: stats.contributors, label: t.landing.statContributors },
              ].map((stat) => (
                <div className="cmn-stat" key={stat.label}>
                  <div className="cmn-stat-value">
                    {new Intl.NumberFormat(locale).format(stat.value)}
                  </div>
                  <div className="cmn-stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          </VStack>
        </div>
      </Section>

      <Section variant="muted" padding={0}>
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
            <div className="cmn-pool-frame">
              <div className="cmn-pool-bar">
                <span>
                  <span className="cmn-live-dot" />
                  live pool · {tableData.length} models
                </span>
                <span>/v1/models</span>
              </div>
              <Table data={tableData} columns={columns} />
            </div>
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
            <HStack gap={4} align="center">
              <Text type="supporting" color="secondary">
                OpenAI-compatible · /v1/chat/completions
              </Text>
              <StatusBadge status="active" t={t} />
            </HStack>
          </HStack>
        </VStack>
      </Section>
    </VStack>
  );
}
