import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  findUserByEmail,
  setSessionCookie,
} from "@/lib/auth";
import { hashPassword, randomToken } from "@/lib/crypto";
import { id, now, one, run } from "@/lib/db";
import {
  consumeGoogleState,
  fetchGoogleProfile,
  googleRedirectUri,
} from "@/lib/google";

type UserRow = { id: string; status: string; role: string };

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const base = request.nextUrl.origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${base}/login?error=google`);
  }
  if (!(await consumeGoogleState(state))) {
    return NextResponse.redirect(`${base}/login?error=google_state`);
  }

  let profile;
  try {
    profile = await fetchGoogleProfile(code, googleRedirectUri(base));
  } catch {
    return NextResponse.redirect(`${base}/login?error=google`);
  }
  if (!profile.email || !profile.sub) {
    return NextResponse.redirect(`${base}/login?error=google`);
  }
  const email = profile.email.trim().toLowerCase();

  // Link an existing email/password account to Google, or create a new user.
  // OAuth-only users get a random unguessable password hash because the
  // column is NOT NULL and password login must never succeed for them.
  const existing = await findUserByEmail(email);
  let user: UserRow | undefined;
  if (existing) {
    await run("UPDATE users SET google_id = ? WHERE id = ?", profile.sub, existing.id);
    user = { id: existing.id, status: existing.status, role: existing.role };
  } else {
    const userId = id("usr_");
    await run(
      `INSERT INTO users (id, email, name, password_hash, role, status, locale, created_at, google_id)
       VALUES (?, ?, ?, ?, 'user', 'active', 'en', ?, ?)`,
      userId,
      email,
      profile.name?.trim() || email.split("@")[0],
      hashPassword(randomToken()),
      now(),
      profile.sub,
    );
    user = await one<UserRow>(
      "SELECT id, status, role FROM users WHERE id = ?",
      userId,
    );
  }

  if (!user || user.status !== "active") {
    return NextResponse.redirect(`${base}/login?error=suspended`);
  }

  await setSessionCookie(await createSession(user.id));
  return NextResponse.redirect(
    `${base}${user.role === "admin" ? "/admin" : "/dashboard"}`,
  );
}
