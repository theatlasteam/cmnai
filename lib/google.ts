import { cookies } from "next/headers";
import { randomToken } from "./crypto";

export const GOOGLE_STATE_COOKIE = "cmnai_gstate";
const STATE_TTL_SECONDS = 10 * 60;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL =
  "https://openidconnect.googleapis.com/v1/userinfo";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function googleRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}

export async function createGoogleState(): Promise<string> {
  const state = randomToken();
  (await cookies()).set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return state;
}

export async function consumeGoogleState(state: string): Promise<boolean> {
  const jar = await cookies();
  const expected = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_STATE_COOKIE);
  return Boolean(expected) && expected === state;
}

export function googleAuthorizeUrl(state: string, redirectUri: string): string {
  const { clientId } = googleConfig()!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function fetchGoogleProfile(
  code: string,
  redirectUri: string,
): Promise<GoogleProfile> {
  const { clientId, clientSecret } = googleConfig()!;
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("google token exchange failed");
  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("google token missing");

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  if (!profileResponse.ok) throw new Error("google profile fetch failed");
  return (await profileResponse.json()) as GoogleProfile;
}
