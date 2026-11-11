import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  generateApiKey,
  hashApiKey,
  hashPassword,
  randomToken,
} from "./crypto";
import { all, id, now, one, run } from "./db";

export const SESSION_COOKIE = "cmnai_session";
const SESSION_DAYS = 30;

export type User = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  locale: "en" | "ru";
  created_at: string;
};

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  requests: number;
  created_at: string;
  revoked_at: string | null;
};

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await run(
    "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    token,
    userId,
    expires,
    now(),
  );
  return token;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await run("DELETE FROM sessions WHERE token = ?", token);
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const user = await one<User>(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.locale, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    token,
    now(),
  );
  if (!user || user.status !== "active") return null;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const userId = id("usr_");
  await run(
    `INSERT INTO users (id, email, name, password_hash, role, status, locale, created_at)
     VALUES (?, ?, ?, ?, 'user', 'active', 'en', ?)`,
    userId,
    input.email.trim().toLowerCase(),
    input.name.trim(),
    hashPassword(input.password),
    now(),
  );
  const user = await one<User>("SELECT * FROM users WHERE id = ?", userId);
  if (!user) throw new Error("registration failed");
  return user;
}

export async function findUserByEmail(email: string) {
  return one<User & { password_hash: string }>(
    "SELECT * FROM users WHERE email = ?",
    email.trim().toLowerCase(),
  );
}

export async function createApiKeyForUser(userId: string, name: string) {
  const { key, prefix, hash } = generateApiKey();
  const keyId = id("key_");
  await run(
    `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    keyId,
    userId,
    name.trim() || "Default key",
    prefix,
    hash,
    now(),
  );
  return { id: keyId, key, prefix };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  return all<ApiKeyRow>(
    `SELECT id, user_id, name, prefix, last_used_at, requests, created_at, revoked_at
     FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    userId,
  );
}

export async function authenticateApiKey(raw: string | null) {
  if (!raw) return null;
  const key = await one<ApiKeyRow & { user_status: string }>(
    `SELECT k.id, k.user_id, k.name, k.prefix, k.last_used_at, k.requests,
            k.created_at, k.revoked_at, u.status AS user_status
     FROM api_keys k JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    hashApiKey(raw),
  );
  if (!key || key.user_status !== "active") return null;
  await run(
    "UPDATE api_keys SET last_used_at = ?, requests = requests + 1 WHERE id = ?",
    now(),
    key.id,
  );
  return key;
}
