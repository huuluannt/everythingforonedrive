import { GRAPH_BASE_URL } from "@/lib/config";
import { normalizeSearchText } from "@/lib/search";

export type GraphDriveItem = {
  id: string;
  name?: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  parentReference?: {
    driveId?: string;
    id?: string;
    path?: string;
  };
  folder?: Record<string, unknown>;
  file?: Record<string, unknown>;
  deleted?: Record<string, unknown>;
};

export type GraphCollection<T> = {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export class GraphError extends Error {
  status: number;
  retryAfter?: number;
  location?: string;

  constructor(message: string, status: number, retryAfter?: number, location?: string) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.location = location;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds);
  }

  const dateMs = Date.parse(value);

  if (Number.isNaN(dateMs)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
}

async function readGraphError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string };
    };

    return body.error?.message || body.error?.code || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function graphFetchJson<T>(
  accessToken: string,
  pathOrUrl: string,
  init: RequestInit = {},
) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH_BASE_URL}${pathOrUrl}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...init.headers,
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
    const shouldRetry = response.status === 429 || response.status === 503;

    if (shouldRetry && retryAfter !== undefined && retryAfter <= 8 && attempt < 2) {
      await sleep(retryAfter * 1000);
      continue;
    }

    throw new GraphError(
      await readGraphError(response),
      response.status,
      retryAfter,
      response.headers.get("Location") || undefined,
    );
  }

  throw new GraphError("Microsoft Graph request failed", 500);
}

export function graphItemPath(item: GraphDriveItem) {
  const parentPath = item.parentReference?.path || "";
  const rootIndex = parentPath.indexOf("root:");
  const afterRoot = rootIndex >= 0 ? parentPath.slice(rootIndex + "root:".length) : "";
  const decodedParent = decodeURIComponent(afterRoot || "/").replace(/\/$/, "");
  const name = item.name || "";

  return `${decodedParent || ""}/${name}`.replace(/\/{2,}/g, "/");
}

export function normalizeName(name: string) {
  return normalizeSearchText(name);
}

export function itemExtension(name: string, type: "file" | "folder") {
  if (type === "folder") {
    return null;
  }

  const index = name.lastIndexOf(".");

  if (index <= 0 || index === name.length - 1) {
    return null;
  }

  return name.slice(index + 1).toLowerCase();
}
