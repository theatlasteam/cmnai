import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Theme } from "@astryxdesign/core/theme";
import { connection } from "next/server";
import { seed } from "@/lib/seed";
import "./globals.css";
import "@astryxdesign/core/astryx.css";
import { themes, defaultThemeSlug } from "@/astryx-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "cmnAI — community-owned AI inference",
  description:
    "One OpenAI-compatible API for models pooled and reviewed by the community. Free keys, no vendor lock-in, built for people doing real work.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  await seed();

  return (
    <html
      lang="en"
      data-theme="dark"
      data-astryx-theme="neutral"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Theme theme={themes[defaultThemeSlug]} mode="dark">
          {children}
        </Theme>
      </body>
    </html>
  );
}
