import { getLocale, dictionaries } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { DashSideNav } from "@/components/dash-side-nav";
import { PageShell } from "@/components/page-shell";

/**
 * The dashboard is an AppShell with a side rail. The rail carries the brand,
 * the destinations and the account actions, so there is no top bar.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, user] = await Promise.all([getLocale(), requireUser()]);
  const t = dictionaries[locale];

  return (
    <PageShell sideNav={<DashSideNav t={t} locale={locale} user={user} />}>
      {children}
    </PageShell>
  );
}
