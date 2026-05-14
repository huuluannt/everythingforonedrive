import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  SESSION_COOKIE,
  cookieSecurityOptions,
  createSession,
  exchangeCodeForTokens,
  type MicrosoftProfile,
} from "@/lib/auth";
import { graphFetchJson } from "@/lib/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = cookieStore.get(OAUTH_VERIFIER_COOKIE)?.value;

  if (error) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return NextResponse.redirect(new URL("/?auth_error=invalid_oauth_state", request.url));
  }

  try {
    const token = await exchangeCodeForTokens(code, verifier, request);
    const profile = await graphFetchJson<MicrosoftProfile>(
      token.access_token,
      "/me?$select=id,displayName,mail,userPrincipalName",
    );
    const sessionToken = await createSession(profile, token);
    const response = NextResponse.redirect(new URL("/", request.url));

    response.cookies.set(SESSION_COOKIE, sessionToken, cookieSecurityOptions(60 * 60 * 24 * 180));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_VERIFIER_COOKIE);

    return response;
  } catch (authError) {
    console.error(authError);
    return NextResponse.redirect(new URL("/?auth_error=oauth_callback_failed", request.url));
  }
}
