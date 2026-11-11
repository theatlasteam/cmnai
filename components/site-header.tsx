"use client";

import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import { MobileNavToggle } from "@astryxdesign/core/MobileNav";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { Globe } from "geist-icons";
import { BrandMark } from "./brand";
import { localeSwitchAction } from "@/app/actions/locale";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";
import type { User } from "@/lib/auth";

export function SiteHeader({
  t,
  locale,
  user,
}: {
  t: Dictionary;
  locale: Locale;
  user: User | null;
}) {
  const { isMobile } = useAppShellMobile();

  return (
    <TopNav
      className="cmn-topnav"
      label={t.nav.menu}
      heading={
        <TopNavHeading
          logo={<BrandMark size={26} />}
          heading="cmnAI"
          headingHref="/"
          subheading={t.tagline}
        />
      }
      startContent={
        <>
          <TopNavItem label={t.nav.how} href="/#how" />
          <TopNavItem label={t.nav.pool} href="/#pool" />
          <TopNavItem label={t.nav.providers} href="/providers" />
          <TopNavItem label={t.nav.docs} href="/docs" />
          {isMobile ? (
            user ? (
              <>
                {user.role === "admin" ? <TopNavItem label={t.nav.admin} href="/admin" /> : null}
                <TopNavItem label={t.nav.dashboard} href="/dashboard" />
              </>
            ) : (
              <>
                <TopNavItem label={t.nav.signIn} href="/login" />
                <TopNavItem label={t.nav.getKey} href="/signup" />
              </>
            )
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
            user ? (
              <>
                {user.role === "admin" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    label={t.nav.admin}
                    href="/admin"
                  />
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  label={t.nav.dashboard}
                  href="/dashboard"
                />
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  label={t.nav.signIn}
                  href="/login"
                />
                <Button
                  variant="primary"
                  size="sm"
                  label={t.nav.getKey}
                  href="/signup"
                />
              </>
            )
          ) : null}
          <MobileNavToggle label={t.nav.menu} />
        </HStack>
      }
    />
  );
}
