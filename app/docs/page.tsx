import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Table, pixel } from "@/components/data-table";
import { BookOpen } from "geist-icons";
import { getCurrentUser } from "@/lib/auth";
import { dictionaries, getLocale } from "@/lib/i18n";
import { rateLimitPerMinute, dailyTokenLimit } from "@/lib/limits";
import { getSiteUrl } from "@/lib/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CopyRow } from "@/components/copy-button";
import { PageShell } from "@/components/page-shell";



export default async function DocsPage() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  const t = dictionaries[locale];
  const rpm = rateLimitPerMinute();
  const dailyTokens = dailyTokenLimit();
  const contributorDailyTokens = dailyTokenLimit(true);
  const number = new Intl.NumberFormat(locale);
  const apiBase = `${await getSiteUrl()}/v1`;

  const modelsCurl = `curl ${apiBase}/models \\
  -H "Authorization: Bearer YOUR_KEY"`;

  const chatCurl = `curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "You are a concise assistant." },
      { "role": "user", "content": "Draft a status update." }
    ],
    "stream": true
  }'`;

  const nodeExample = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiBase}",
  apiKey: process.env.CMNAI_API_KEY,
});

const completion = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello from the community pool" }],
});

console.log(completion.choices[0].message.content);`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${apiBase}",
    api_key="YOUR_KEY",
)

completion = client.chat.completions.create(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)
print(completion.choices[0].message.content)`;

  const errorData = [
    { code: "401", meaning: "Missing, revoked or suspended key" },
    { code: "404", meaning: "Model is not in the pool" },
    { code: "429", meaning: "Fair-use rate or daily token limit reached" },
    { code: "503", meaning: "No healthy endpoint for that model right now" },
  ];

  return (
    <PageShell topNav={<SiteHeader t={t} locale={locale} user={user} />}>
      <Section variant="transparent" padding={0}>
        <VStack
          className="cmn-page"
          width="100%"
          maxWidth={1120}
          paddingInline={6}
          paddingBlock={8}
          gap={6}
        >
          <VStack gap={2} align="start">
            <HStack gap={2} align="center">
              <BookOpen size={22} />
              <Heading level={1}>{t.docs.title}</Heading>
            </HStack>
            <Text type="large" color="secondary" className="max-w-2xl">
              {t.docs.subtitle}
            </Text>
          </VStack>

          <Card padding={5}>
            <VStack gap={3}>
              <HStack gap={2} align="center" wrap="wrap">
                <Text type="label" color="secondary">{t.docs.baseUrl}</Text>
                <Text type="code" wordBreak="break-all">{apiBase}</Text>
              </HStack>
              <CopyRow value={apiBase} label={t.landing.copy} copiedLabel={t.landing.copied} />
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3} align="start">
              <Heading level={2}>{t.docs.authTitle}</Heading>
              <Text type="body" color="secondary">
                {t.docs.authBody}
              </Text>
              <CodeBlock
                code={`Authorization: Bearer YOUR_KEY`}
                language="http"
                hasCopyButton
              />
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3} align="start">
              <Heading level={2}>{t.docs.modelsTitle}</Heading>
              <CodeBlock code={modelsCurl} language="bash" hasCopyButton isWrapped width="100%" />
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3} align="start">
              <Heading level={2}>{t.docs.chatTitle}</Heading>
              <Text type="body" color="secondary">
                {t.docs.chatBody}
              </Text>
              <CodeBlock code={chatCurl} language="bash" hasCopyButton isWrapped width="100%" />
              <HStack gap={4} width="100%" wrap="wrap">
                <VStack gap={2} width="100%" maxWidth={520}>
                  <Text type="label">TypeScript</Text>
                  <CodeBlock code={nodeExample} language="typescript" hasCopyButton isWrapped />
                </VStack>
                <VStack gap={2} width="100%" maxWidth={520}>
                  <Text type="label">Python</Text>
                  <CodeBlock code={pythonExample} language="python" hasCopyButton isWrapped />
                </VStack>
              </HStack>
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3} align="start">
              <Heading level={2}>{t.docs.limitsTitle}</Heading>
              <Text type="body" color="secondary">
                {t.docs.limitsBody}
              </Text>
              <VStack gap={2} width="100%">
                <Text type="code">{number.format(rpm)} · {t.dash.rateLimitLabel}</Text>
                <HStack gap={2} justify="between" wrap="wrap" width="100%">
                  <Text type="body">{t.docs.memberLimit}</Text>
                  <Text type="code">{number.format(dailyTokens)} · {t.dash.dailyLimitLabel}</Text>
                </HStack>
                <HStack gap={2} justify="between" wrap="wrap" width="100%">
                  <Text type="body">{t.docs.contributorLimit}</Text>
                  <Text type="code" color="accent">{number.format(contributorDailyTokens)} · {t.dash.dailyLimitLabel}</Text>
                </HStack>
              </VStack>
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3} align="start">
              <Heading level={2}>{t.docs.headersTitle}</Heading>
              <Text type="body" color="secondary">
                {t.docs.headersBody}
              </Text>
              <CodeBlock
                code={`X-RateLimit-Limit: ${rpm}
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1790000060
X-Daily-Token-Limit: ${dailyTokens}
X-Daily-Tokens-Used: 12680
X-Daily-Tokens-Remaining: ${Math.max(0, dailyTokens - 12_680)}`}
                language="http"
                hasCopyButton
                isWrapped
                width="100%"
              />
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3} align="start">
              <Heading level={2}>{t.docs.errorsTitle}</Heading>
              <Text type="body" color="secondary">
                {t.docs.errorsBody}
              </Text>
              <Card padding={0} width="100%">
                <Table
                  data={errorData}
                  columns={[
                    { key: "code", header: "Status", width: pixel(100) },
                    { key: "meaning", header: "Meaning" },
                  ]}
                />
              </Card>
            </VStack>
          </Card>
        </VStack>
      </Section>
      <SiteFooter t={t} />
    </PageShell>
  );
}
