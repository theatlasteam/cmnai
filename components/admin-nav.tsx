"use client";

import { usePathname } from "next/navigation";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { ArrowLeft, Globe, Logout } from "geist-icons";
import { BrandMark } from "./brand";
import { localeSwitchAction } from "@/app/actions/locale";
import { logoutAction } from "@/app/actions/auth";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { User } from "@/lib/auth";

export function AdminNav({
  t,
  locale,
  user,
  pendingCount,
}: {
  t: Dictionary;
  locale: Locale;
  user: User;
  pendingCount: number;
}) {
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: t.admin.title },
    { href: "/admin/providers", label: t.admin.providers },
    { href: "/admin/users", label: t.admin.users },
  ];

  return (
    <TopNav
      className="cmn-topnav"
      heading={
        <TopNavHeading
          logo={<BrandMark size={26} />}
          heading="cmnAI"
          headingHref="/"
          subheading={t.admin.title}
          headerEndContent={
            <Badge variant={pendingCount > 0 ? "warning" : "success"} label={String(pendingCount)} />
          }
        />
      }
      startContent={
        <HStack gap={1} align="center">
          {links.map((link) => (
            <TopNavItem
              key={link.href}
              label={link.label}
              href={link.href}
              isSelected={
                link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href)
              }
            />
          ))}
        </HStack>
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
          <Button
            variant="ghost"
            size="sm"
            label={t.dash.overview}
            href="/dashboard"
            icon={<ArrowLeft size={16} />}
          />
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
        </HStack>
      }
    />
  );
}
