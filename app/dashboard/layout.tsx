import { VStack } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { getLocale, dictionaries } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { DashNav } from "@/components/dash-nav";



export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, user] = await Promise.all([getLocale(), requireUser()]);
  const t = dictionaries[locale];

  return (
    <VStack width="100%" minHeight="100vh" gap={0}>
      <DashNav t={t} locale={locale} user={user} />
      <Section variant="transparent" padding={0}>
        <VStack
          className="cmn-page"
          width="100%"
          maxWidth={1120}
          paddingInline={6}
          paddingBlock={8}
          gap={6}
        >
          {children}
        </VStack>
      </Section>
    </VStack>
  );
}
