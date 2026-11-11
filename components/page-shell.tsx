import type { ReactNode } from "react";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { AppShell } from "@astryxdesign/core/AppShell";

/** One shell owns navigation, the mobile drawer and the main content landmark. */
export async function PageShell({
  topNav,
  children,
}: {
  topNav: ReactNode;
  children: ReactNode;
}) {
  const { device } = userAgent({ headers: await headers() });

  return (
    <AppShell
      topNav={topNav}
      height="auto"
      variant="wash"
      contentPadding={0}
      mobileNav={{
        breakpoint: "xl",
        hasToggle: false,
        defaultIsMobile: device.type === "mobile" || device.type === "tablet",
      }}
    >
      {children}
    </AppShell>
  );
}
