import { VStack } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { requireAdmin } from "@/lib/auth";
import { dictionaries, getLocale } from "@/lib/i18n";
import { one } from "@/lib/db";
import { AdminNav } from "@/components/admin-nav";



export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, user] = await Promise.all([getLocale(), requireAdmin()]);
  const t = dictionaries[locale];
  const pending = await one<{ c: number }>(
    `SELECT (SELECT COUNT(*) FROM providers WHERE status = 'pending')
          + (SELECT COUNT(*) FROM models WHERE status = 'pending') AS c`,
  );

  return (
    <VStack width="100%" minHeight="100vh" gap={0}>
      <AdminNav t={t} locale={locale} user={user} pendingCount={pending?.c ?? 0} />
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
