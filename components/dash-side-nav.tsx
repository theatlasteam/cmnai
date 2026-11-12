"use client";

import { usePathname } from "next/navigation";
import { SideNav } from "@astryxdesign/core/SideNav";
import { SideNavHeading } from "@astryxdesign/core/SideNav";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import { SideNavSection } from "@astryxdesign/core/SideNav";
import { Button } from "@astryxdesign/core/Button";
import { Globe, Logout, Sparkles } from "geist-icons";
import {
  ChartActivity,
  FileText,
  Key,
  Layers,
  Servers,
  Terminal,
} from "geist-icons";
import { BrandMark } from "./brand";
import { localeSwitchAction } from "@/app/actions/locale";
import { logoutAction } from "@/app/actions/auth";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { User } from "@/lib/auth";

/**
 * Dashboard navigation. It sits beside the content rather than in the top bar
 * so the destinations stay reachable as the account grows. The brand and the
 * account actions live in the same rail.
 */
export function DashSideNav({
  t,
  locale,
  user,
}: {
  t: Dictionary;
  locale: Locale;
  user: User;
}) {
  const pathname = usePathname();
  const isSelected = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <SideNav
      collapsible
      resizable={{ defaultWidth: 260 }}
      header={
        <SideNavHeading
          heading="cmnAI"
          headingHref="/"
          icon={<BrandMark size={24} />}
          subheading={t.dash.title}
        />
      }
      footerIcons={
        <>
          <form action={localeSwitchAction}>
            <input type="hidden" name="locale" value={locale === "en" ? "ru" : "en"} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              label={locale === "en" ? "RU" : "EN"}
              isIconOnly
              icon={<Globe size={16} />}
            />
          </form>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              label={t.nav.signOut}
              isIconOnly
              icon={<Logout size={16} />}
            />
          </form>
        </>
      }
    >
      <SideNavSection title={t.dash.title}>
        <SideNavItem
          label={t.dash.overview}
          href="/dashboard"
          icon={ChartActivity}
          isSelected={isSelected("/dashboard")}
        />
        <SideNavItem
          label={t.events.title}
          href="/dashboard/events"
          icon={Sparkles}
          isSelected={isSelected("/dashboard/events")}
        />
        <SideNavItem
          label={t.dash.usage}
          href="/dashboard/usage"
          icon={Terminal}
          isSelected={isSelected("/dashboard/usage")}
        />
      </SideNavSection>

      <SideNavSection title={t.nav.menu}>
        <SideNavItem
          label={t.dash.keys}
          href="/dashboard/keys"
          icon={Key}
          isSelected={isSelected("/dashboard/keys")}
        />
        <SideNavItem
          label={t.dash.endpoints}
          href="/dashboard/endpoints"
          icon={Servers}
          isSelected={isSelected("/dashboard/endpoints")}
        />
        <SideNavItem label={t.nav.providers} href="/providers" icon={FileText} />
        <SideNavItem label={t.dash.docs} href="/docs" icon={Layers} />
        {user.role === "admin" ? (
          <SideNavItem label={t.nav.admin} href="/admin" icon={FileText} />
        ) : null}
      </SideNavSection>
    </SideNav>
  );
}
