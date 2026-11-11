"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE } from "@/lib/i18n";

export async function localeSwitchAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "en") === "ru" ? "ru" : "en";
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 86400,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
