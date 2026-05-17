"use client";

import Image from "next/image";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  FolderOpen,
  History,
  LoaderCircle,
  LogOut,
  Presentation,
  RefreshCcw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { normalizeSearchText, parseSearchQuery } from "@/lib/search";

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

type FileVisual = {
  Icon: LucideIcon;
  label: string;
  className: string;
  badge?: string;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
  { id: "search", label: "Search", icon: Search },
  { id: "folders", label: "Folders", icon: FolderPlus },
  { id: "sync", label: "Sync", icon: RefreshCcw },
  { id: "settings", label: "Settings", icon: Settings },
];

const logoSrc = "/brand/logo-evrtfod.png";

const pdfExtensions = new Set(["pdf"]);
const wordExtensions = new Set(["doc", "docx", "dot", "dotx"]);
const excelExtensions = new Set(["xls", "xlsx", "xlsm", "csv"]);
const powerpointExtensions = new Set(["ppt", "pptx", "pps", "ppsx"]);
const textExtensions = new Set(["txt", "md", "rtf", "log"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic"]);
const audioExtensions = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg"]);
const videoExtensions = new Set(["mp4", "mov", "mkv", "avi", "webm", "wmv"]);
const archiveExtensions = new Set(["zip", "rar", "7z", "tar", "gz"]);
const codeExtensions = new Set(["js", "ts", "tsx", "jsx", "html", "css", "json", "xml"]);

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

function fileVisual(result: SearchResult): FileVisual {
  if (result.itemType === "folder") {
    return {
      Icon: FolderOpen,
      label: "Folder",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }

  const extension = result.extension?.toLowerCase() || "";

  if (pdfExtensions.has(extension)) {
    return {
      Icon: FileText,
      label: "PDF",
      className: "bg-red-50 text-red-700 ring-red-200",
      badge: "PDF",
    };
  }

  if (wordExtensions.has(extension)) {
    return { Icon: FileText, label: "Word", className: "bg-blue-50 text-blue-700 ring-blue-200" };
  }

  if (excelExtensions.has(extension)) {
    return {
      Icon: FileSpreadsheet,
      label: "Excel",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    };
  }

  if (powerpointExtensions.has(extension)) {
    return {
      Icon: Presentation,
      label: "PowerPoint",
      className: "bg-orange-50 text-orange-700 ring-orange-200",
    };
  }

  if (textExtensions.has(extension)) {
    return { Icon: FileText, label: "Text", className: "bg-slate-100 text-slate-700 ring-slate-200" };
  }

  if (imageExtensions.has(extension)) {
    return { Icon: FileImage, label: "Image", className: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200" };
  }

  if (audioExtensions.has(extension)) {
    return { Icon: FileAudio, label: "Audio", className: "bg-rose-50 text-rose-700 ring-rose-200" };
  }

  if (videoExtensions.has(extension)) {
    return { Icon: FileVideo, label: "Video", className: "bg-red-50 text-red-700 ring-red-200" };
  }

  if (archiveExtensions.has(extension)) {
    return { Icon: FileArchive, label: "Archive", className: "bg-yellow-50 text-yellow-700 ring-yellow-200" };
  }

  if (codeExtensions.has(extension)) {
    return { Icon: FileCode2, label: "Code", className: "bg-indigo-50 text-indigo-700 ring-indigo-200" };
  }

  return { Icon: File, label: "File", className: "bg-slate-50 text-slate-600 ring-slate-200" };
}

function statusClass(status: IndexedFolder["syncStatus"]) {
  if (status === "idle") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "syncing" || status === "pending") {
    return "bg-orange-50 text-orange-700 ring-orange-200";
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

function normalizedHighlightSource(text: string) {
  const chars: string[] = [];
  const positions: number[] = [];

  Array.from(text).forEach((char, index) => {
    const normalized = normalizeSearchText(char);
    const safeChar = normalized && /^[a-z0-9]$/.test(normalized) ? normalized : " ";

    chars.push(safeChar);
    positions.push(index);
  });

  return { text: chars.join(""), positions };
}

function highlightRanges(text: string, terms: string[]) {
  const cleanTerms = Array.from(new Set(terms.map(normalizeSearchText).filter(Boolean)));

  if (cleanTerms.length === 0) {
    return [];
  }

  const source = normalizedHighlightSource(text);
  const ranges: Array<{ start: number; end: number }> = [];

  cleanTerms.forEach((term) => {
    let index = source.text.indexOf(term);

    while (index >= 0) {
      const start = source.positions[index];
      const end = source.positions[index + term.length - 1] + 1;

      ranges.push({ start, end });
      index = source.text.indexOf(term, index + term.length);
    }
  });

  return ranges
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .reduce<Array<{ start: number; end: number }>>((merged, range) => {
      const previous = merged[merged.length - 1];

      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push({ ...range });
      }

      return merged;
    }, []);
}

function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  const ranges = highlightRanges(text, terms);

  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (cursor < range.start) {
      segments.push(text.slice(cursor, range.start));
    }

    segments.push(
      <mark
        key={`${range.start}-${range.end}-${index}`}
        className="rounded bg-amber-100 px-0.5 text-inherit ring-1 ring-amber-200"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return <>{segments}</>;
}

function SearchResultsSection({
  highlightTerms,
  results,
  searchError,
  searchBusy,
  searching,
}: {
  highlightTerms: string[];
  results: SearchResult[];
  searchError: string | null;
  searchBusy: boolean;
  searching: boolean;
}) {
  return (
    <section className="flex flex-col gap-1.5" aria-busy={searchBusy}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-700">Results</h2>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          {searchBusy ? <LoaderCircle size={12} className="animate-spin text-zinc-700" /> : null}
          {searching || searchBusy ? "Searching..." : `${results.length} shown`}
        </span>
      </div>
      {searchBusy ? (
        <div className="mx-1 h-0.5 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-zinc-700" />
        </div>
      ) : null}
      {searchError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          {searchError}
        </div>
      ) : results.length === 0 && searchBusy ? (
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="flex gap-2 rounded-lg border border-blue-100 bg-white p-2 shadow-sm"
            >
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-zinc-100" />
              <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
                <div className="flex gap-1">
                  <span className="h-4 w-10 animate-pulse rounded bg-slate-100" />
                  <span className="h-4 w-12 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-blue-200 bg-white p-6 text-center text-sm text-slate-500">
          No indexed results yet. Add a folder and run sync first.
        </div>
      ) : (
        results.map((result) => {
          const visual = fileVisual(result);
          const Icon = visual.Icon;

          return (
            <a
              key={result.id}
              href={result.webUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="flex gap-2 rounded-lg border border-blue-100 bg-white p-1.5 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
            >
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${visual.className}`}
              >
                {visual.badge ? (
                  <span className="text-[8px] font-black tracking-normal">{visual.badge}</span>
                ) : (
                  <Icon size={16} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 break-words text-[12px] font-semibold leading-4 text-slate-950 [overflow-wrap:anywhere]">
                    <HighlightedText text={result.name} terms={highlightTerms} />
                  </h3>
                  <ExternalLink size={12} className="mt-0.5 shrink-0 text-slate-400" />
                </div>
                <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-3 text-slate-500">
                  <HighlightedText text={result.path} terms={highlightTerms} />
                </p>
                <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-medium leading-none text-slate-600">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{visual.label}</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5">
                    {result.extension || "no ext"}
                  </span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{formatSize(result.size)}</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5">
                    {formatDate(result.modifiedDateTime)}
                  </span>
                </div>
              </div>
            </a>
          );
        })
      )}
    </section>
  );
}

export function AppShell() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState<string | null>(null);
  const [searchSort, setSearchSort] = useState<SearchSort>("relevance");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [folders, setFolders] = useState<OneDriveFolder[]>([]);
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([
    { id: "root", name: "OneDrive" },
  ]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [indexedFolders, setIndexedFolders] = useState<IndexedFolder[]>([]);
  const [busyFolderIds, setBusyFolderIds] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<Record<string, SyncProgress>>({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [floatingSearchBottom, setFloatingSearchBottom] = useState(88);
  const debouncedQuery = useDebouncedValue(query, 250);
  const effectiveSearchQuery = submittedSearchQuery ?? debouncedQuery;
  const autoSyncStarted = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const floatingSearchDrag = useRef({
    moved: false,
    startBottom: 88,
    startY: 0,
  });

  const userInitial = useMemo(() => {
    if (!session?.authenticated || !session.user) return "";
    const name = session.user.displayName || session.user.email || "";
    return name.charAt(0).toUpperCase();
  }, [session]);

  const handleMicrosoftLogin = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    const isIframe = typeof window !== "undefined" && window.self !== window.top;
    if (isIframe) {
      event.preventDefault();
      
      const width = 600;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        "/api/auth/microsoft/login",
        "Microsoft Login",
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
      );
      
      if (popup) {
        popup.focus();
      } else {
        setMessage("Please enable popups for this site to log in.");
      }
    }
  }, []);

  const activeFolder = folderStack[folderStack.length - 1];
  const indexedKeys = useMemo(
    () => new Set(indexedFolders.filter((folder) => folder.enabled).map((folder) => folder.folderId)),
    [indexedFolders],
  );
  const activeIndexedFolders = useMemo(
    () => indexedFolders.filter((folder) => folder.enabled),
    [indexedFolders],
  );
  const sortedResults = results;
  const authenticatedSession = session?.authenticated ? session : null;
  const queryHasText = query.trim().length > 0;
  const accountLabel =
    authenticatedSession?.user.email || authenticatedSession?.user.displayName || "Checking account...";
  const syncFinished =
    activeIndexedFolders.length > 0 &&
    activeIndexedFolders.every((folder) => folder.syncStatus === "idle") &&
    busyFolderIds.size === 0 &&
    !syncingAll;
  const syncNeedsAttention =
    activeIndexedFolders.length === 0 ||
    syncingAll ||
    busyFolderIds.size > 0 ||
    activeIndexedFolders.some((folder) => folder.syncStatus !== "idle");
  const syncDotLabel = !authenticatedSession
    ? "Checking account"
    : syncFinished
      ? "All selected folders are synced"
      : syncNeedsAttention
        ? "Sync is running or not finished yet"
        : "Sync status";
  const syncAllDisabled =
    !authenticatedSession || syncingAll || activeIndexedFolders.length === 0 || busyFolderIds.size > 0;
  const searchBusy =
    queryHasText &&
    (session === null ||
      (Boolean(session?.authenticated) && (searching || query !== effectiveSearchQuery)));
  const showSearchResults =
    activeTab === "search" && (queryHasText || searchBusy || Boolean(searchError));
  const highlightTerms = useMemo(() => {
    const parsed = parseSearchQuery(query);

    return parsed.pathKeyword
      ? [...parsed.searchTerms, parsed.pathKeyword]
      : parsed.searchTerms;
  }, [query]);
  const focusSearch = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);
  const clearSearch = useCallback(() => {
    setQuery("");
    setSubmittedSearchQuery("");
    setResults([]);
    setSearchError(null);
    setSearching(false);
    focusSearch();
  }, [focusSearch]);
  const handleSearchInputChange = useCallback((value: string) => {
    setSubmittedSearchQuery(null);
    if (value.trim()) {
      setSearching(true);
    } else {
      setResults([]);
      setSearchError(null);
      setSearching(false);
    }
    setQuery(value);
    setActiveTab("search");
  }, []);
  const handleSearchInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    setSubmittedSearchQuery(query);
    setActiveTab("search");

    if (!query.trim()) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);

    const isMobileViewport = window.matchMedia("(pointer: coarse), (max-width: 640px)").matches;

    if (!isMobileViewport) {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [query]);
  const startFloatingSearchDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    floatingSearchDrag.current = {
      moved: false,
      startBottom: floatingSearchBottom,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [floatingSearchBottom]);
  const moveFloatingSearch = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    const delta = floatingSearchDrag.current.startY - event.clientY;

    if (Math.abs(delta) > 4) {
      floatingSearchDrag.current.moved = true;
    }

    const maxBottom = Math.max(88, window.innerHeight - 128);
    const nextBottom = Math.min(
      Math.max(72, floatingSearchDrag.current.startBottom + delta),
      maxBottom,
    );
    setFloatingSearchBottom(nextBottom);
  }, []);
  const endFloatingSearchDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!floatingSearchDrag.current.moved) {
      focusSearch();
    }
  }, [focusSearch]);

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
      setFoldersLoaded(true);
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
        setMessage(null);
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
    setMessage(null);

    let failed = 0;

    for (const folder of activeIndexedFolders) {
      const ok = await runSync(folder.id, { quiet: true });
      failed += ok ? 0 : 1;
    }

    setSyncingAll(false);
    await loadIndexedFolders();
    setMessage(failed ? `Sync finished with ${failed} folder issue(s).` : null);
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
    const timer = window.setTimeout(() => {
      setSearchHistory(loadInitialSearchHistory());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

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
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "MICROSOFT_AUTH_COMPLETED") {
        console.log("Microsoft OAuth completed in popup. Origin:", event.origin);
        if (event.origin !== window.location.origin) {
          console.warn("Origin mismatch for postMessage:", event.origin, "vs expected:", window.location.origin);
        }
        
        fetch("/api/session", { cache: "no-store" })
          .then((response) => response.json())
          .then((data: SessionState) => {
            setSession(data);
            setMessage("Signed in successfully!");
          })
          .catch(() => {
            setMessage("Failed to load signed in session.");
          });
      }
    }
    
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.opener && session?.authenticated) {
      window.opener.postMessage({ type: "MICROSOFT_AUTH_COMPLETED" }, "*");
      
      // Introduce a 300ms delay to guarantee the postMessage is fully dispatched before the window is destroyed
      setTimeout(() => {
        window.close();
      }, 300);
    }
  }, [session]);

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    let cancelled = false;

    fetch("/api/indexed-folders", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (response.ok) {
          const data = (await response.json()) as { folders: IndexedFolder[] };
          if (!cancelled) {
            setIndexedFolders(data.folders);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("Could not load selected folders.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated || activeTab !== "folders" || foldersLoaded) {
      return;
    }

    fetch("/api/onedrive/folders?parentId=root", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (response.ok) {
          const data = (await response.json()) as { folders: OneDriveFolder[] };
          setFolders(data.folders);
          setFolderStack([{ id: "root", name: "OneDrive" }]);
          setFoldersLoaded(true);
        }
      })
      .catch(() => setMessage("Could not load OneDrive folders."));
  }, [activeTab, foldersLoaded, handleUnauthorized, session?.authenticated]);

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
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [session, indexedFolders, runSync]);

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    if (!effectiveSearchQuery.trim()) {
      return;
    }

    let cancelled = false;

    async function search() {
      setSearching(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(effectiveSearchQuery)}&limit=50&sort=${searchSort}`,
        );

        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) {
          setSearchError("Search failed. Try again after refreshing sync.");
          return;
        }

        const data = (await response.json()) as { results: SearchResult[] };

        if (cancelled) {
          return;
        }

        setResults(data.results);
        rememberSearch(effectiveSearchQuery);
      } catch {
        if (cancelled) {
          return;
        }

        setSearchError("Search failed. Try again after refreshing sync.");
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }

    search();

    return () => {
      cancelled = true;
    };
  }, [effectiveSearchQuery, handleUnauthorized, rememberSearch, searchSort, session?.authenticated]);

  if (session?.authenticated === false) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-5 py-8">
        <section className="mx-auto flex max-w-md flex-col gap-7">
          <div className="flex items-center gap-3">
            <Image
              src={logoSrc}
              alt="Everything for OneDrive logo"
              width={56}
              height={56}
              priority
              className="h-14 w-14 rounded-2xl object-cover shadow-sm ring-1 ring-zinc-200"
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                Everything for OneDrive
              </h1>
              <p className="text-sm text-slate-600">Fast selected-folder search.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Sign in with Microsoft</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The app requests only profile access and read-only OneDrive metadata. It stores file and
              folder names, paths, size, modified time, type, and OneDrive links.
            </p>
            <a
              href="/api/auth/microsoft/login"
              onClick={handleMicrosoftLogin}
              className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
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
    <main className="min-h-screen bg-[var(--background)] pb-20 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-[rgba(248,250,252,0.94)] px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src={logoSrc}
                alt="Everything for OneDrive logo"
                width={48}
                height={48}
                priority
                className="h-12 w-12 rounded-2xl object-cover shadow-sm ring-1 ring-zinc-200"
              />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-normal">Everything for OneDrive</h1>
                <p className="truncate text-xs font-medium text-slate-600">
                  {accountLabel}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={runSyncAll}
                disabled={syncAllDisabled}
                className="flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                title={`${syncDotLabel}. Click to sync all.`}
                aria-label="Sync all folders"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    syncFinished ? "bg-emerald-500" : "animate-pulse bg-amber-500"
                  }`}
                />
                <span className="hidden sm:inline">{syncFinished ? "Synced" : "Syncing"}</span>
              </button>
              {authenticatedSession ? (
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-sm ring-1 ring-blue-200"
                    title={authenticatedSession.user.displayName || authenticatedSession.user.email || ""}
                  >
                    {userInitial}
                  </div>
                  <form action="/api/auth/logout" method="post">
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-slate-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950"
                      title="Sign out"
                    >
                      <LogOut size={18} />
                    </button>
                  </form>
                </div>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-slate-300 shadow-sm"
                  title="Checking account"
                  aria-label="Checking account"
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </div>
          <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 shadow-sm">
            <Search size={19} className="shrink-0 text-zinc-700" />
            <input
              id="global-search"
              ref={searchInputRef}
              value={query}
              onChange={(event) => handleSearchInputChange(event.target.value)}
              onKeyDown={handleSearchInputKeyDown}
              onClick={(event) => event.currentTarget.select()}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Search files, folders, ext:pdf, type:folder..."
              className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearSearch}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-zinc-200 hover:text-zinc-900"
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            ) : null}
            {searchBusy ? (
              <LoaderCircle size={16} className="shrink-0 animate-spin text-zinc-700" />
            ) : null}
            <div className="hidden h-6 w-px bg-zinc-200 sm:block" />
            <SlidersHorizontal size={16} className="hidden shrink-0 text-zinc-700 sm:block" />
            <select
              aria-label="Sort search results"
              value={searchSort}
              onChange={(event) => setSearchSort(event.target.value as SearchSort)}
              className="w-24 shrink-0 bg-transparent text-xs font-semibold text-slate-700 outline-none sm:w-40"
            >
              <option value="relevance">Relevance</option>
              <option value="modified">Modified</option>
              <option value="name">Name A-Z</option>
              <option value="size">Largest</option>
            </select>
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
        {message ? (
          <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {message}
          </div>
        ) : null}

        {showSearchResults ? (
          <SearchResultsSection
            highlightTerms={highlightTerms}
            results={sortedResults}
            searchError={searchError}
            searchBusy={searchBusy}
            searching={searching}
          />
        ) : null}

        {activeTab === "search" ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <History size={14} />
                Recent searches
              </span>
              {searchHistory.length > 0 ? (
                <button
                  onClick={() => saveSearchHistory([])}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500"
                >
                  <X size={13} />
                  Clear
                </button>
              ) : null}
            </div>
            {searchHistory.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {searchHistory.map((item) => (
                  <button
                    key={item}
                    onClick={() => setQuery(item)}
                    className="flex h-6 shrink-0 items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 text-[10px] font-semibold leading-none text-zinc-800"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Searches you use will appear here.</p>
            )}
          </section>
        ) : null}

        {activeTab === "folders" ? (
          <div className="flex flex-col gap-2">
            <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Browse OneDrive folders</h2>
                  <p className="truncate text-[11px] text-slate-500">{activeFolder.name}</p>
                </div>
                {folderStack.length > 1 ? (
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-slate-700"
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

            <section className="flex flex-col gap-1.5">
              {folders.map((folder) => {
                const selected = indexedKeys.has(folder.folderId);

                return (
                  <div
                    key={folder.folderId}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm"
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() =>
                        loadFolders(folder.folderId, [
                          ...folderStack,
                          { id: folder.folderId, name: folder.folderName },
                        ])
                      }
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                        <Folder size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-4">{folder.folderName}</span>
                        <span className="block truncate text-[11px] leading-4 text-slate-500">{folder.folderPath}</span>
                      </span>
                    </button>
                    <button
                      onClick={() => addFolder(folder)}
                      disabled={selected}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white disabled:bg-emerald-600"
                      title={selected ? "Indexed" : "Add to index"}
                    >
                      {selected ? <Check size={16} /> : <FolderPlus size={16} />}
                    </button>
                  </div>
                );
              })}
            </section>
          </div>
        ) : null}

        {activeTab === "sync" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Selected folders</h2>
                <span className="text-xs text-slate-500">{activeIndexedFolders.length} active</span>
              </div>
              <button
                onClick={runSyncAll}
                disabled={syncAllDisabled}
                className="flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 text-sm font-semibold text-white disabled:bg-zinc-300"
              >
                <RefreshCcw size={16} className={syncingAll ? "animate-spin" : ""} />
                Sync all
              </button>
            </div>

            {activeIndexedFolders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 text-center text-sm text-slate-500">
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
                      className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                          <Folder size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-[13px] font-semibold leading-4">{folder.folderName}</h3>
                          <p className="mt-0.5 truncate text-[11px] leading-4 text-slate-500">
                            {folder.folderPath}
                          </p>
                        </div>
                        <div className="flex max-w-[52%] shrink-0 flex-wrap items-center justify-end gap-1.5 text-[10px]">
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                            <span className="text-slate-400">Last sync </span>
                            {formatDate(folder.lastSyncAt)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${statusClass(folder.syncStatus)}`}
                          >
                            {busy ? "syncing" : folder.syncStatus}
                          </span>
                        </div>
                      </div>

                      {folder.lastError ? (
                        <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] leading-4 text-rose-700">
                          {folder.lastError}
                        </p>
                      ) : null}

                      {warning ? (
                        <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
                          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                          {warning}
                        </p>
                      ) : null}

                      {progress ? (
                        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-zinc-700">
                            <span>{busy ? "Sync in progress" : "Last sync run"}</span>
                            <span>{progress.hasMore ? "More batches" : "Caught up"}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                            <div
                              className={`h-full rounded-full ${progress.hasMore ? "w-2/3 animate-pulse bg-zinc-700" : "w-full bg-emerald-600"}`}
                            />
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] text-zinc-700">
                            <span>{progress.batches} batches</span>
                            <span>{progress.pages} pages</span>
                            <span>{progress.items} items</span>
                          </div>
                          {progress.retryAfter ? (
                            <p className="mt-1.5 text-[10px] text-amber-700">
                              Microsoft throttled requests. Retrying after about {progress.retryAfter}s.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-2 flex gap-1.5">
                        <button
                          onClick={() => runSync(folder.id)}
                          disabled={busy}
                          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 text-sm font-semibold text-white disabled:bg-zinc-300"
                        >
                          <RefreshCcw size={17} className={busy ? "animate-spin" : ""} />
                          Sync now
                        </button>
                        <div className="flex h-9 min-w-[72px] flex-col items-center justify-center rounded-lg bg-slate-50 px-2 leading-none">
                          <span className="text-[9px] font-semibold text-slate-400">Items</span>
                          <strong className="mt-0.5 text-[11px] text-slate-900">{folder.itemCount}</strong>
                        </div>
                        <button
                          onClick={() => runSync(folder.id, { full: true })}
                          disabled={busy}
                          className="flex h-9 items-center justify-center rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-slate-700 disabled:text-slate-400"
                        >
                          Full
                        </button>
                        <button
                          onClick={() => removeFolder(folder.id)}
                          disabled={busy}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-100 text-rose-700 disabled:text-rose-300"
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
          <div className="flex flex-col gap-3">
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Search capabilities</h2>
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <p>
                  Search không dấu: gõ <strong>trong</strong> vẫn tìm được các tên có dấu như{" "}
                  <strong>Trọng</strong>.
                </p>
                <p>
                  Search có dấu được ưu tiên chính xác hơn: gõ <strong>Trọng</strong> sẽ xếp kết quả
                  chứa đúng chữ <strong>Trọng</strong> trước các kết quả chỉ khớp kiểu không dấu như{" "}
                  <strong>trong</strong>.
                </p>
                <p>
                  Có thể đổi thứ tự từ khóa: <strong>C2024 HD</strong>, <strong>KHCN C2024</strong>{" "}
                  hoặc nhiều cụm từ rời vẫn tìm trong cùng tên và đường dẫn.
                </p>
                <p>
                  Search theo tên file, tên folder và path để tìm những file nằm sâu trong thư mục.
                </p>
                <p>
                  Lọc theo loại bằng cú pháp <strong>type:folder</strong> hoặc <strong>type:file</strong>.
                </p>
                <p>
                  Lọc theo định dạng bằng <strong>ext:pdf</strong>, <strong>ext:xls</strong>,{" "}
                  <strong>ext:docx</strong>, <strong>ext:pptx</strong>, <strong>ext:mp4</strong>,{" "}
                  <strong>ext:mp3</strong>, <strong>ext:jpg</strong>...
                </p>
                <p>
                  Lọc theo đường dẫn bằng <strong>path:downloads</strong> hoặc một từ khóa trong tên
                  thư mục.
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">MVP boundaries</h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                <p>Indexes selected folders only, including their subfolders.</p>
                <p>Searches names and metadata only. It does not store file contents.</p>
                <p>Offline mode caches the app shell and recent search API responses.</p>
                <p>Delta sync is attempted per selected folder using Microsoft Graph delta links.</p>
              </div>
            </section>
          </div>
        ) : null}
      </section>

      <button
        type="button"
        onPointerDown={startFloatingSearchDrag}
        onPointerMove={moveFloatingSearch}
        onPointerUp={endFloatingSearchDrag}
        onPointerCancel={endFloatingSearchDrag}
        onClick={(event) => {
          if (floatingSearchDrag.current.moved) {
            event.preventDefault();
            return;
          }

          focusSearch();
        }}
        className="fixed right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-zinc-900 px-4 text-sm font-bold text-white shadow-lg shadow-zinc-900/20 ring-1 ring-zinc-700/30 transition hover:bg-zinc-800 active:cursor-grabbing sm:right-6 touch-none"
        style={{ bottom: `${floatingSearchBottom}px` }}
        title="Focus search"
        aria-label="Focus search"
      >
        <Search size={20} />
        <span className="hidden sm:inline">Search</span>
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-3 pb-2 pt-1.5 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${
                  active ? "bg-zinc-900 text-white" : "text-slate-500"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
