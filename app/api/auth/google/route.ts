import { NextRequest, NextResponse } from "next/server";
import {
  createGoogleState,
  googleAuthorizeUrl,
  googleConfig,
  googleRedirectUri,
} from "@/lib/google";

export async function GET(request: NextRequest) {
  if (!googleConfig()) {
    return NextResponse.json(
      { error: "Google sign-in is not configured" },
      { status: 501 },
    );
  }
  const state = await createGoogleState();
  const url = googleAuthorizeUrl(
    state,
    googleRedirectUri(request.nextUrl.origin),
  );
  return NextResponse.redirect(url);
}
