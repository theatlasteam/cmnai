"use client";

import { usePathname } from "next/navigation";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import { Avatar } from "@astryxdesign/core/Avatar";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { MobileNavToggle } from "@astryxdesign/core/MobileNav";
import { Globe, Logout } from "geist-icons";
import { BrandMark } from "./brand";
import { localeSwitchAction } from "@/app/actions/locale";
import { logoutAction } from "@/app/actions/auth";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { User } from "@/lib/auth";

export function DashNav({
  t,
  locale,
  user,
}: {
  t: Dictionary;
  locale: Locale;
  user: User;
}) {
  const pathname = usePathname();
  const { isMobile } = useAppShellMobile();
  const links = [
    { href: "/dashboard", label: t.dash.overview },
    { href: "/dashboard/usage", label: t.dash.usage },
    { href: "/dashboard/keys", label: t.dash.keys },
    { href: "/dashboard/endpoints", label: t.dash.endpoints },
    { href: "/providers", label: t.nav.providers },
    { href: "/docs", label: t.dash.docs },
  ];

  return (
    <TopNav
      className="cmn-topnav"
      label={t.dash.title}
      heading={
        <TopNavHeading
          logo={<BrandMark size={26} />}
          heading="cmnAI"
          headingHref="/"
          subheading={t.dash.title}
        />
      }
      startContent={
        <>
          {links.map((link) => (
            <TopNavItem
              key={link.href}
              label={link.label}
              href={link.href}
              isSelected={
                link.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(link.href)
              }
            />
          ))}
          {user.role === "admin" ? (
            <TopNavItem label={t.nav.admin} href="/admin" isSelected={pathname.startsWith("/admin")} />
          ) : null}
          {isMobile ? (
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" label={t.nav.signOut} icon={<Logout size={16} />} />
            </form>
          ) : null}
        </>
      }
      endContent={
        <HStack gap={2} align="center">
          <form action={localeSwitchAction}>
            <input type="hidden" name="locale" value={locale === "en" ? "ru" : "en"} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              label={locale === "en" ? "RU" : "EN"}
              icon={<Globe size={16} />}
            />
          </form>
          {!isMobile ? (
            <>
              <Avatar name={user.name} size="sm" />
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
          ) : null}
          <MobileNavToggle label={t.nav.menu} />
        </HStack>
      }
    />
  );
}
