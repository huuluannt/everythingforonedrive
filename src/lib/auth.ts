import { cookies, headers } from "next/headers";

import {
  MICROSOFT_AUTHORITY,
  MICROSOFT_SCOPE_STRING,
  getRedirectUri,
  requiredEnv,
} from "@/lib/config";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { randomToken } from "@/lib/pkce";

export const SESSION_COOKIE = "efo_session";
export const OAUTH_STATE_COOKIE = "efo_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "efo_oauth_verifier";

type SessionRow = {
  session_token: string;
  microsoft_account_id: string;
  display_name: string | null;
  email: string | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  access_token_expires_at: Date;
};

export type CurrentSession = {
  sessionToken: string;
  accountId: string;
  displayName: string | null;
  email: string | null;
  accessToken: string;
};

export type MicrosoftTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
};

export type MicrosoftProfile = {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

export function cookieSecurityOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  request: Request,
) {
  const body = new URLSearchParams({
    client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
    client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(request),
    scope: MICROSOFT_SCOPE_STRING,
  });

  const response = await fetch(`${MICROSOFT_AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Microsoft token exchange failed: ${await response.text()}`);
  }

  return (await response.json()) as MicrosoftTokenResponse;
}

export async function refreshMicrosoftTokens(row: SessionRow) {
  const refreshToken = decryptSecret(row.refresh_token_ciphertext);
  const body = new URLSearchParams({
    client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
    client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: MICROSOFT_SCOPE_STRING,
  });

  const response = await fetch(`${MICROSOFT_AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Microsoft token refresh failed: ${await response.text()}`);
  }

  const token = (await response.json()) as MicrosoftTokenResponse;
  const sql = getSql();
  const encryptedAccessToken = encryptSecret(token.access_token);
  const encryptedRefreshToken = encryptSecret(token.refresh_token || refreshToken);
  const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000);

  await sql`
    update app_sessions
    set access_token_ciphertext = ${encryptedAccessToken},
        refresh_token_ciphertext = ${encryptedRefreshToken},
        access_token_expires_at = ${accessTokenExpiresAt},
        updated_at = now()
    where session_token = ${row.session_token}
  `;

  return token.access_token;
}

export async function createSession(profile: MicrosoftProfile, token: MicrosoftTokenResponse) {
  if (!token.refresh_token) {
    throw new Error("Microsoft did not return a refresh token. Check offline_access consent.");
  }

  const sql = getSql();
  const sessionToken = randomToken(48);
  const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000);
  const sessionExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180);
  const email = profile.mail || profile.userPrincipalName || null;

  await sql`
    insert into app_sessions (
      session_token,
      microsoft_account_id,
      display_name,
      email,
      access_token_ciphertext,
      refresh_token_ciphertext,
      access_token_expires_at,
      expires_at
    ) values (
      ${sessionToken},
      ${profile.id},
      ${profile.displayName || null},
      ${email},
      ${encryptSecret(token.access_token)},
      ${encryptSecret(token.refresh_token)},
      ${accessTokenExpiresAt},
      ${sessionExpiresAt}
    )
  `;

  return sessionToken;
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  let sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    try {
      const headersList = await headers();
      const authHeader = headersList.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.substring(7);
      }
    } catch (e) {
      console.error("Error reading authorization header:", e);
    }
  }

  if (!sessionToken) {
    return null;
  }

  const sql = getSql();
  const [row] = await sql<SessionRow[]>`
    select session_token,
           microsoft_account_id,
           display_name,
           email,
           access_token_ciphertext,
           refresh_token_ciphertext,
           access_token_expires_at
    from app_sessions
    where session_token = ${sessionToken}
      and expires_at > now()
    limit 1
  `;

  if (!row) {
    return null;
  }

  const shouldRefresh = row.access_token_expires_at.getTime() < Date.now() + 1000 * 60 * 5;
  const accessToken = shouldRefresh
    ? await refreshMicrosoftTokens(row)
    : decryptSecret(row.access_token_ciphertext);

  return {
    sessionToken,
    accountId: row.microsoft_account_id,
    displayName: row.display_name,
    email: row.email,
    accessToken,
  };
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    await getSql()`delete from app_sessions where session_token = ${sessionToken}`;
  }

  cookieStore.delete(SESSION_COOKIE);
}
