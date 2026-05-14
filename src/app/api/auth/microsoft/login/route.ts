import { NextResponse } from "next/server";

import {
  MICROSOFT_AUTHORITY,
  MICROSOFT_SCOPE_STRING,
  getRedirectUri,
  requiredEnv,
} from "@/lib/config";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  cookieSecurityOptions,
} from "@/lib/auth";
import { codeChallenge, randomToken } from "@/lib/pkce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const params = new URLSearchParams({
    client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
    redirect_uri: getRedirectUri(request),
    response_type: "code",
    scope: MICROSOFT_SCOPE_STRING,
    state,
  });

  const response = NextResponse.redirect(`${MICROSOFT_AUTHORITY}/authorize?${params}`);

  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieSecurityOptions(60 * 10));
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieSecurityOptions(60 * 10));

  return response;
}
