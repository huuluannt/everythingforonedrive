"use client";

import {
  ArrowLeft,
  Check,
  Cloud,
  ExternalLink,
  File,
  Folder,
  FolderPlus,
  History,
  LogOut,
  RefreshCcw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionState =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id: string;
        displayName: string | null;
        email: string | null;
      };
    };

type OneDriveFolder = {
  driveId: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  webUrl?: string;
};

type IndexedFolder = OneDriveFolder & {
  id: string;
  enabled: boolean;
  itemCount: number;
  lastSyncAt: string | null;
  syncStatus: "pending" | "syncing" | "idle" | "paused" | "error" | "disabled";
  lastError: string | null;
};

type SearchResult = {
  id: string;
  name: string;
  itemType: "file" | "folder";
  extension: string | null;
  size: number | null;
  modifiedDateTime: string | null;
  webUrl: string | null;
  path: string;
  rank: number;
};

type Tab = "search" | "folders" | "sync" | "settings";
type SearchSort = "relevance" | "modified" | "name" | "size";

type SyncProgress = {
  folderName: string;
  batches: number;
  pages: number;
  items: number;
  hasMore: boolean;
  retryAfter?: number;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
  { id: "search", label: "Search", icon: Search },
  { id: "folders", label: "Folders", icon: FolderPlus },
  { id: "sync", label: "Sync", icon: RefreshCcw },
  { id: "settings", label: "Settings", icon: Settings },
];

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function formatSize(size: number | null) {
  if (size === null) {
    return "-";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: IndexedFolder["syncStatus"]) {
  if (status === "idle") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "syncing" || status === "pending") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (status === "paused") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-rose-50 text-rose-700 ring-rose-200";
}

function wait(seconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
}

function loadInitialSearchHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawHistory = window.localStorage.getItem("efo_search_history");

    if (!rawHistory) {
      return [];
    }

    const parsed = JSON.parse(rawHistory);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => typeof item === "string").slice(0, 8);
  } catch {
    return [];
  }
}

function largeFolderWarning(itemCount: number) {
  if (itemCount >= 50000) {
    return "Very large index. Sync may take many batches on free-tier hosting.";
  }

  if (itemCount >= 10000) {
    return "Large index. Sync in smaller moments if Microsoft throttles requests.";
  }

  return null;
}

export function AppShell() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [searchSort, setSearchSort] = useState<SearchSort>("relevance");
  const [searchHistory, setSearchHistory] = useState<string[]>(loadInitialSearchHistory);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [folders, setFolders] = useState<OneDriveFolder[]>([]);
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([
    { id: "root", name: "OneDrive" },
  ]);
  const [indexedFolders, setIndexedFolders] = useState<IndexedFolder[]>([]);
  const [busyFolderIds, setBusyFolderIds] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<Record<string, SyncProgress>>({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 250);
  const autoSyncStarted = useRef(false);

  const activeFolder = folderStack[folderStack.length - 1];
  const indexedKeys = useMemo(
    () => new Set(indexedFolders.filter((folder) => folder.enabled).map((folder) => folder.folderId)),
    [indexedFolders],
  );
  const activeIndexedFolders = useMemo(
    () => indexedFolders.filter((folder) => folder.enabled),
    [indexedFolders],
  );

  const saveSearchHistory = useCallback((items: string[]) => {
    setSearchHistory(items);
    window.localStorage.setItem("efo_search_history", JSON.stringify(items));
  }, []);

  const rememberSearch = useCallback((value: string) => {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    setSearchHistory((current) => {
      const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 8);
      window.localStorage.setItem("efo_search_history", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleUnauthorized = useCallback(() => {
    setSession({ authenticated: false });
    setResults([]);
    setSearchError("Your Microsoft session expired. Sign in again to search indexed items.");
    setMessage("Your Microsoft session expired. Please sign in again.");
  }, []);

  const loadIndexedFolders = useCallback(async () => {
    const response = await fetch("/api/indexed-folders", { cache: "no-store" });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    if (response.ok) {
      const data = (await response.json()) as { folders: IndexedFolder[] };
      setIndexedFolders(data.folders);
    }
  }, [handleUnauthorized]);

  const loadFolders = useCallback(async (parentId: string, stack: Array<{ id: string; name: string }>) => {
    const response = await fetch(`/api/onedrive/folders?parentId=${encodeURIComponent(parentId)}`, {
      cache: "no-store",
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    if (response.ok) {
      const data = (await response.json()) as { folders: OneDriveFolder[] };
      setFolders(data.folders);
      setFolderStack(stack);
    }
  }, [handleUnauthorized]);

  const updateIndexedFolder = useCallback((folder: IndexedFolder) => {
    setIndexedFolders((current) =>
      current.map((item) => (item.id === folder.id ? folder : item)),
    );
  }, []);

  const runSync = useCallback(async (folderId: string, options: { full?: boolean; oneBatch?: boolean; quiet?: boolean } = {}) => {
    const targetFolder = indexedFolders.find((folder) => folder.id === folderId);

    setBusyFolderIds((current) => new Set(current).add(folderId));

    if (!options.quiet) {
      setMessage(null);
    }

    setSyncProgress((current) => ({
      ...current,
      [folderId]: {
        folderName: targetFolder?.folderName || "Folder",
        batches: 0,
        pages: 0,
        items: 0,
        hasMore: true,
      },
    }));

    try {
      let hasMore = true;
      let loops = 0;

      while (hasMore && loops < (options.oneBatch ? 1 : 80)) {
        const response = await fetch(`/api/sync/folders/${folderId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full: options.full && loops === 0, maxPages: 2 }),
        });
        const data = await response.json();

        if (response.status === 401) {
          handleUnauthorized();
          throw new Error("Please sign in again before syncing.");
        }

        if (data.folder) {
          updateIndexedFolder(data.folder);
        }

        if (response.status === 429) {
          setSyncProgress((current) => ({
            ...current,
            [folderId]: {
              ...(current[folderId] || {
                folderName: targetFolder?.folderName || "Folder",
                batches: loops,
                pages: 0,
                items: 0,
                hasMore: true,
              }),
              retryAfter: Number(data.retryAfter || 5),
            },
          }));
          await wait(Math.min(Number(data.retryAfter || 5), 30));
          continue;
        }

        if (!response.ok) {
          throw new Error(data.error || "Sync failed");
        }

        hasMore = Boolean(data.hasMore);
        loops += 1;
        setSyncProgress((current) => {
          const previous = current[folderId] || {
            folderName: data.folder?.folderName || targetFolder?.folderName || "Folder",
            batches: 0,
            pages: 0,
            items: 0,
            hasMore,
          };

          return {
            ...current,
            [folderId]: {
              folderName: data.folder?.folderName || previous.folderName,
              batches: previous.batches + 1,
              pages: previous.pages + Number(data.processedPages || 0),
              items: previous.items + Number(data.processedItems || 0),
              hasMore,
            },
          };
        });
      }

      await loadIndexedFolders();
      if (!options.quiet) {
        setMessage("Sync finished.");
      }
      return true;
    } catch (error) {
      if (!options.quiet) {
        setMessage(error instanceof Error ? error.message : "Sync failed.");
      }
      return false;
    } finally {
      setBusyFolderIds((current) => {
        const next = new Set(current);
        next.delete(folderId);
        return next;
      });
    }
  }, [handleUnauthorized, indexedFolders, loadIndexedFolders, updateIndexedFolder]);

  const runSyncAll = useCallback(async () => {
    if (syncingAll || activeIndexedFolders.length === 0) {
      return;
    }

    setSyncingAll(true);
    setActiveTab("sync");
    setMessage(`Syncing ${activeIndexedFolders.length} selected folders...`);

    let completed = 0;
    let failed = 0;

    for (const folder of activeIndexedFolders) {
      const ok = await runSync(folder.id, { quiet: true });
      completed += ok ? 1 : 0;
      failed += ok ? 0 : 1;
      setMessage(`Sync all: ${completed} done${failed ? `, ${failed} failed` : ""}.`);
    }

    setSyncingAll(false);
    await loadIndexedFolders();
    setMessage(failed ? `Sync all finished with ${failed} folder issue(s).` : "Sync all finished.");
  }, [activeIndexedFolders, loadIndexedFolders, runSync, syncingAll]);

  async function addFolder(folder: OneDriveFolder) {
    const response = await fetch("/api/indexed-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(folder),
    });
    const data = (await response.json()) as { folder?: IndexedFolder; error?: string };

    if (!response.ok || !data.folder) {
      setMessage(data.error || "Could not save folder.");
      return;
    }

    setIndexedFolders((current) => {
      const existing = current.filter((item) => item.id !== data.folder?.id);
      return [data.folder as IndexedFolder, ...existing];
    });
    setActiveTab("sync");
    await runSync(data.folder.id);
  }

  async function removeFolder(folderId: string) {
    const response = await fetch(`/api/indexed-folders/${folderId}`, { method: "DELETE" });

    if (!response.ok) {
      setMessage("Could not remove folder.");
      return;
    }

    await loadIndexedFolders();
    setMessage("Folder removed from the index.");
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: SessionState) => {
        if (!cancelled) {
          setSession(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession({ authenticated: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    let cancelled = false;

    Promise.all([
      fetch("/api/indexed-folders", { cache: "no-store" }),
      fetch("/api/onedrive/folders?parentId=root", { cache: "no-store" }),
    ])
      .then(async ([indexedResponse, foldersResponse]) => {
        if (cancelled) {
          return;
        }

        if (indexedResponse.ok) {
          const indexedData = (await indexedResponse.json()) as { folders: IndexedFolder[] };
          setIndexedFolders(indexedData.folders);
        } else if (indexedResponse.status === 401) {
          handleUnauthorized();
          return;
        }

        if (foldersResponse.ok) {
          const folderData = (await foldersResponse.json()) as { folders: OneDriveFolder[] };
          setFolders(folderData.folders);
          setFolderStack([{ id: "root", name: "OneDrive" }]);
        } else if (foldersResponse.status === 401) {
          handleUnauthorized();
        }
      })
      .catch(() => setMessage("Could not load OneDrive data."));

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated || indexedFolders.length === 0 || autoSyncStarted.current) {
      return;
    }

    autoSyncStarted.current = true;
    const candidates = indexedFolders.filter(
      (folder) => folder.enabled && folder.syncStatus !== "syncing" && folder.syncStatus !== "disabled",
    );

    const timer = window.setTimeout(() => {
      for (const folder of candidates.slice(0, 5)) {
        runSync(folder.id, { oneBatch: true });
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [session, indexedFolders, runSync]);

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    const controller = new AbortController();

    async function search() {
      setSearching(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=50&sort=${searchSort}`,
          { signal: controller.signal },
        );

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) {
          setSearchError("Search failed. Try again after refreshing sync.");
          return;
        }

        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
        rememberSearch(debouncedQuery);
      } finally {
        setSearching(false);
      }
    }

    search();

    return () => controller.abort();
  }, [debouncedQuery, handleUnauthorized, rememberSearch, searchSort, session?.authenticated]);

  if (session === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-5 py-8">
        <section className="mx-auto flex max-w-md flex-col gap-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white">
              <Cloud size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                Everything for OneDrive
              </h1>
              <p className="text-sm text-slate-600">Personal selected-folder index.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Sign in with Microsoft</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The app requests only profile access and read-only OneDrive metadata. It stores file and
              folder names, paths, size, modified time, type, and OneDrive links.
            </p>
            <a
              href="/api/auth/microsoft/login"
              className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              <Shield size={18} />
              Continue with Microsoft
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] pb-24 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-blue-100 bg-[rgba(247,250,255,0.92)] px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-normal">Everything for OneDrive</h1>
            <p className="truncate text-xs text-slate-600">
              {session.user.displayName || session.user.email || "Microsoft account"}
            </p>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-white text-slate-700 shadow-sm"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
        {message ? (
          <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {message}
          </div>
        ) : null}

        {activeTab === "search" ? (
          <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <label className="text-xs font-semibold uppercase text-slate-500" htmlFor="search">
                Search indexed files
              </label>
              <div className="mt-2 flex h-12 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3">
                <Search size={19} className="text-blue-700" />
                <input
                  id="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ext:pdf type:file budget"
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
                  autoComplete="off"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Filters: ext:pdf, ext:docx, type:file, type:folder, path:keyword
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2">
                <SlidersHorizontal size={16} className="text-blue-700" />
                <label className="text-xs font-semibold text-slate-500" htmlFor="sort">
                  Sort
                </label>
                <select
                  id="sort"
                  value={searchSort}
                  onChange={(event) => setSearchSort(event.target.value as SearchSort)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none"
                >
                  <option value="relevance">Relevance</option>
                  <option value="modified">Modified newest</option>
                  <option value="name">Name A-Z</option>
                  <option value="size">Size largest</option>
                </select>
              </div>
              {searchHistory.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <History size={14} />
                      Recent searches
                    </span>
                    <button
                      onClick={() => saveSearchHistory([])}
                      className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500"
                    >
                      <X size={13} />
                      Clear
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {searchHistory.map((item) => (
                      <button
                        key={item}
                        onClick={() => setQuery(item)}
                        className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-700">Results</h2>
                <span className="text-xs text-slate-500">
                  {searching ? "Searching..." : `${results.length} shown`}
                </span>
              </div>
              {searchError ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  {searchError}
                </div>
              ) : results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-6 text-center text-sm text-slate-500">
                  No indexed results yet. Add a folder and run sync first.
                </div>
              ) : (
                results.map((result) => (
                  <a
                    key={result.id}
                    href={result.webUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-3 shadow-sm transition hover:border-blue-300"
                  >
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      {result.itemType === "folder" ? <Folder size={20} /> : <File size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="break-words text-sm font-semibold text-slate-950">
                          {result.name}
                        </h3>
                        <ExternalLink size={15} className="mt-0.5 shrink-0 text-slate-400" />
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-500">{result.path}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
                        <span className="rounded-lg bg-slate-100 px-2 py-1">{result.itemType}</span>
                        <span className="rounded-lg bg-slate-100 px-2 py-1">
                          {result.extension || "no ext"}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2 py-1">
                          {formatSize(result.size)}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2 py-1">
                          {formatDate(result.modifiedDateTime)}
                        </span>
                      </div>
                    </div>
                  </a>
                ))
              )}
            </section>
          </div>
        ) : null}

        {activeTab === "folders" ? (
          <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Browse OneDrive folders</h2>
                  <p className="truncate text-xs text-slate-500">{activeFolder.name}</p>
                </div>
                {folderStack.length > 1 ? (
                  <button
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 text-slate-700"
                    onClick={() => {
                      const nextStack = folderStack.slice(0, -1);
                      loadFolders(nextStack[nextStack.length - 1].id, nextStack);
                    }}
                    title="Back"
                  >
                    <ArrowLeft size={18} />
                  </button>
                ) : null}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              {folders.map((folder) => {
                const selected = indexedKeys.has(folder.folderId);

                return (
                  <div
                    key={folder.folderId}
                    className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-3 shadow-sm"
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() =>
                        loadFolders(folder.folderId, [
                          ...folderStack,
                          { id: folder.folderId, name: folder.folderName },
                        ])
                      }
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                        <Folder size={20} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{folder.folderName}</span>
                        <span className="block truncate text-xs text-slate-500">{folder.folderPath}</span>
                      </span>
                    </button>
                    <button
                      onClick={() => addFolder(folder)}
                      disabled={selected}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white disabled:bg-emerald-600"
                      title={selected ? "Indexed" : "Add to index"}
                    >
                      {selected ? <Check size={18} /> : <FolderPlus size={18} />}
                    </button>
                  </div>
                );
              })}
            </section>
          </div>
        ) : null}

        {activeTab === "sync" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Selected folders</h2>
                <span className="text-xs text-slate-500">{activeIndexedFolders.length} active</span>
              </div>
              <button
                onClick={runSyncAll}
                disabled={syncingAll || activeIndexedFolders.length === 0 || busyFolderIds.size > 0}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white disabled:bg-blue-300"
              >
                <RefreshCcw size={16} className={syncingAll ? "animate-spin" : ""} />
                Sync all
              </button>
            </div>

            {activeIndexedFolders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-6 text-center text-sm text-slate-500">
                Choose folders before indexing. The app never indexes your whole OneDrive by default.
              </div>
            ) : (
              activeIndexedFolders
                .map((folder) => {
                  const busy = busyFolderIds.has(folder.id);
                  const progress = syncProgress[folder.id];
                  const warning = largeFolderWarning(folder.itemCount);

                  return (
                    <section
                      key={folder.id}
                      className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                          <Folder size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-semibold">{folder.folderName}</h3>
                          <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                            {folder.folderPath}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${statusClass(folder.syncStatus)}`}
                        >
                          {busy ? "syncing" : folder.syncStatus}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="block text-slate-400">Items</span>
                          <strong className="text-base text-slate-950">{folder.itemCount}</strong>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="block text-slate-400">Last sync</span>
                          <strong className="text-sm text-slate-950">{formatDate(folder.lastSyncAt)}</strong>
                        </div>
                      </div>

                      {folder.lastError ? (
                        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                          {folder.lastError}
                        </p>
                      ) : null}

                      {warning ? (
                        <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                          {warning}
                        </p>
                      ) : null}

                      {progress ? (
                        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-blue-800">
                            <span>{busy ? "Sync in progress" : "Last sync run"}</span>
                            <span>{progress.hasMore ? "More batches" : "Caught up"}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                            <div
                              className={`h-full rounded-full ${progress.hasMore ? "w-2/3 animate-pulse bg-blue-700" : "w-full bg-emerald-600"}`}
                            />
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-blue-900">
                            <span>{progress.batches} batches</span>
                            <span>{progress.pages} pages</span>
                            <span>{progress.items} items</span>
                          </div>
                          {progress.retryAfter ? (
                            <p className="mt-2 text-[11px] text-amber-700">
                              Microsoft throttled requests. Retrying after about {progress.retryAfter}s.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => runSync(folder.id)}
                          disabled={busy}
                          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white disabled:bg-blue-300"
                        >
                          <RefreshCcw size={17} className={busy ? "animate-spin" : ""} />
                          Sync now
                        </button>
                        <button
                          onClick={() => runSync(folder.id, { full: true })}
                          disabled={busy}
                          className="flex h-11 items-center justify-center rounded-xl border border-blue-100 px-3 text-sm font-semibold text-slate-700 disabled:text-slate-400"
                        >
                          Full
                        </button>
                        <button
                          onClick={() => removeFolder(folder.id)}
                          disabled={busy}
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-100 text-rose-700 disabled:text-rose-300"
                          title="Remove folder from index"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </section>
                  );
                })
            )}
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">MVP boundaries</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
              <p>Indexes selected folders only, including their subfolders.</p>
              <p>Searches names and metadata only. It does not store file contents.</p>
              <p>Offline mode caches the app shell and recent search API responses.</p>
              <p>Delta sync is attempted per selected folder using Microsoft Graph delta links.</p>
            </div>
          </section>
        ) : null}
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-blue-100 bg-white/95 px-3 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold ${
                  active ? "bg-blue-700 text-white" : "text-slate-500"
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
