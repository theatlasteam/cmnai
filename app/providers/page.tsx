import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { Key, ShieldCheck } from "geist-icons";
import { getCurrentUser } from "@/lib/auth";
import { dictionaries, getLocale } from "@/lib/i18n";
import { listPublicProviders } from "@/lib/pool";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProviderKeyForm } from "@/components/provider-key-form";
import { PageShell } from "@/components/page-shell";


export default async function ProvidersPage() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  const t = dictionaries[locale];
  const providers = await listPublicProviders();
  const apiModeLabels: Record<string, string> = {
    chat_completions: t.dash.apiModeChat,
    responses: t.dash.apiModeResponses,
    anthropic_messages: t.dash.apiModeAnthropic,
  };

  return (
    <PageShell topNav={<SiteHeader t={t} locale={locale} user={user} />}>
      <Section variant="transparent" padding={0}>
        <VStack
          className="cmn-page"
          width="100%"
          maxWidth={1080}
          paddingInline={6}
          paddingBlock={10}
          gap={6}
        >
          <VStack gap={2}>
            <Heading level={1}>{t.providers.title}</Heading>
            <Text type="body" color="secondary" className="max-w-2xl">
              {t.providers.subtitle}
            </Text>
          </VStack>

          {providers.length === 0 ? (
            <Card padding={6}>
              <VStack gap={3} align="start">
                <Text type="body" color="secondary">
                  {t.providers.empty}
                </Text>
                <Button
                  variant="primary"
                  label={t.providers.becomeProvider}
                  href={user ? "/dashboard/endpoints" : "/signup"}
                  icon={<Key size={16} />}
                />
              </VStack>
            </Card>
          ) : (
            <VStack gap={4} width="100%">
              {providers.map((provider) => (
                <Card key={provider.id} padding={5}>
                  <VStack gap={4}>
                    <HStack
                      width="100%"
                      justify="between"
                      align="start"
                      gap={3}
                      wrap="wrap"
                    >
                      <VStack gap={1}>
                        <HStack gap={2} align="center" wrap="wrap">
                          <Heading level={3}>{provider.name}</Heading>
                          <Badge
                            variant="neutral"
                            label={apiModeLabels[provider.api_mode] ?? t.dash.apiModeChat}
                          />
                        </HStack>
                        <Text type="code" color="secondary">
                          {provider.base_url}
                        </Text>
                      </VStack>
                      <Badge
                        variant={provider.verified_keys > 0 ? "success" : "warning"}
                        label={
                          provider.verified_keys > 0
                            ? `${provider.verified_keys} ${t.providers.verifiedKeys}`
                            : t.providers.noKeys
                        }
                      />
                    </HStack>

                    <VStack gap={1}>
                      <Text type="supporting" color="secondary">
                        {t.providers.models}
                      </Text>
                      <Text type="code">
                        {provider.models.map((model) => model.model_id).join(" · ")}
                      </Text>
                    </VStack>

                    <Divider />

                    {user ? (
                      <VStack gap={2} align="start">
                        <HStack gap={2} align="center">
                          <ShieldCheck size={16} />
                          <Text type="label">{t.providers.addKey}</Text>
                        </HStack>
                        <Text type="supporting" color="secondary">
                          {t.providers.addKeyHint}
                        </Text>
                        <ProviderKeyForm providerId={provider.id} t={t} />
                      </VStack>
                    ) : (
                      <HStack gap={3} align="center" wrap="wrap">
                        <Text type="supporting" color="secondary">
                          {t.providers.signInHint}
                        </Text>
                        <Button
                          variant="secondary"
                          label={t.nav.signIn}
                          href="/login"
                        />
                      </HStack>
                    )}
                  </VStack>
                </Card>
              ))}
            </VStack>
          )}
        </VStack>
      </Section>
      <SiteFooter t={t} />
    </PageShell>
  );
}
