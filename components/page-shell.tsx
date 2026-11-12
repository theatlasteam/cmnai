import type { ReactNode } from "react";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { AppShell } from "@astryxdesign/core/AppShell";

/** One shell owns navigation, the mobile drawer and the main content landmark. */
export async function PageShell({
  topNav,
  sideNav,
  children,
}: {
  topNav?: ReactNode;
  sideNav?: ReactNode;
  children: ReactNode;
}) {
  const { device } = userAgent({ headers: await headers() });

  return (
    <AppShell
      {...(topNav ? { topNav } : {})}
      {...(sideNav ? { sideNav } : {})}
      height="auto"
      variant="wash"
      contentPadding={0}
      mobileNav={{
        breakpoint: "xl",
        defaultIsMobile: device.type === "mobile" || device.type === "tablet",
      }}
    >
      {children}
    </AppShell>
  );
}
