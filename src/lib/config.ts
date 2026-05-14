export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Files.Read",
];

export const MICROSOFT_SCOPE_STRING = MICROSOFT_SCOPES.join(" ");
export const MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
export const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function getBaseUrl(request?: Request) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (request) {
    return new URL(request.url).origin;
  }

  return "http://localhost:3000";
}

export function getRedirectUri(request?: Request) {
  return `${getBaseUrl(request)}/api/auth/microsoft/callback`;
}
