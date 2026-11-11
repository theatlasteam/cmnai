"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { consumeCaptcha, createCaptcha } from "@/lib/captcha";
import {
  clearSessionCookie,
  createApiKeyForUser,
  createSession,
  destroySession,
  findUserByEmail,
  getSessionToken,
  registerUser,
  setSessionCookie,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { dictionaries, type Locale } from "@/lib/i18n";

export type AuthState = { error?: string; ok?: boolean };

const NEW_KEY_COOKIE = "cmnai_newkey";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const locale = (formData.get("locale") as Locale) === "ru" ? "ru" : "en";
  const t = dictionaries[locale].auth.errors;
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const captchaId = String(formData.get("captchaId") ?? "");
  const captchaAnswer = String(formData.get("captchaAnswer") ?? "");

  if (!name || !email || !password || !captchaAnswer) return { error: t.missing };
  if (!validEmail(email)) return { error: t.email };
  if (password.length < 8) return { error: t.password };
  if (!(await consumeCaptcha(captchaId, captchaAnswer))) return { error: t.captcha };
  if (await findUserByEmail(email)) return { error: t.exists };

  let userId: string;
  try {
    const user = await registerUser({ name, email, password });
    userId = user.id;
  } catch {
    return { error: t.exists };
  }

  const token = await createSession(userId);
  await setSessionCookie(token);

  const created = await createApiKeyForUser(userId, "First key");
  (await cookies()).set(NEW_KEY_COOKIE, created.key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  redirect("/dashboard");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const locale = (formData.get("locale") as Locale) === "ru" ? "ru" : "en";
  const t = dictionaries[locale].auth.errors;
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: t.missing };

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: t.credentials };
  }
  if (user.status !== "active") return { error: t.suspended };

  await setSessionCookie(await createSession(user.id));
  redirect(user.role === "admin" ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  const token = await getSessionToken();
  await destroySession(token);
  await clearSessionCookie();
  redirect("/");
}

export async function refreshCaptchaAction(): Promise<
  ReturnType<typeof createCaptcha>
> {
  return createCaptcha();
}
