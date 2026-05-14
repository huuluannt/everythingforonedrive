import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
  GraphError,
  graphFetchJson,
  graphItemPath,
  itemExtension,
  normalizeName,
  type GraphCollection,
  type GraphDriveItem,
} from "@/lib/graph";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type IndexedFolderRow = {
  id: string;
  account_id: string;
  drive_id: string;
  folder_id: string;
  folder_name: string;
  folder_path: string;
  enabled: boolean;
  item_count: number;
  last_sync_at: Date | null;
  delta_link: string | null;
  sync_cursor: string | null;
  sync_status: string;
  last_error: string | null;
};

const syncRequestSchema = z
  .object({
    full: z.boolean().optional(),
    maxPages: z.number().int().min(1).max(5).optional(),
  })
  .optional();

function initialDeltaUrl(folder: IndexedFolderRow) {
  const select = "$select=id,name,parentReference,folder,file,size,lastModifiedDateTime,webUrl,deleted";
  return `/drives/${encodeURIComponent(folder.drive_id)}/items/${encodeURIComponent(folder.folder_id)}/delta?${select}`;
}

function serializeFolder(row: IndexedFolderRow) {
  return {
    id: row.id,
    driveId: row.drive_id,
    folderId: row.folder_id,
    folderName: row.folder_name,
    folderPath: row.folder_path,
    enabled: row.enabled,
    itemCount: row.item_count,
    lastSyncAt: row.last_sync_at,
    syncStatus: row.sync_status,
    lastError: row.last_error,
  };
}

async function upsertGraphItem(folder: IndexedFolderRow, item: GraphDriveItem) {
  const sql = getSql();

  if (item.deleted) {
    await sql`
      update drive_items
      set deleted = true,
          updated_at = now()
      where account_id = ${folder.account_id}
        and indexed_folder_id = ${folder.id}
        and item_id = ${item.id}
    `;
    return;
  }

  if (!item.name || (!item.file && !item.folder)) {
    return;
  }

  const itemType = item.folder ? "folder" : "file";
  const path = graphItemPath(item);

  await sql`
    insert into drive_items (
      account_id,
      drive_id,
      indexed_folder_id,
      item_id,
      parent_id,
      name,
      normalized_name,
      item_type,
      extension,
      size,
      modified_date_time,
      web_url,
      path,
      deleted,
      updated_at
    ) values (
      ${folder.account_id},
      ${folder.drive_id},
      ${folder.id},
      ${item.id},
      ${item.parentReference?.id || null},
      ${item.name},
      ${normalizeName(item.name)},
      ${itemType},
      ${itemExtension(item.name, itemType)},
      ${item.size ?? null},
      ${item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null},
      ${item.webUrl || null},
      ${path},
      false,
      now()
    )
    on conflict (indexed_folder_id, item_id)
    do update set parent_id = excluded.parent_id,
                  name = excluded.name,
                  normalized_name = excluded.normalized_name,
                  item_type = excluded.item_type,
                  extension = excluded.extension,
                  size = excluded.size,
                  modified_date_time = excluded.modified_date_time,
                  web_url = excluded.web_url,
                  path = excluded.path,
                  deleted = false,
                  updated_at = now()
  `;
}

async function refreshFolderCount(folderId: string, status: string, error: string | null, cursor?: string | null, deltaLink?: string | null) {
  const sql = getSql();
  const [countRow] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from drive_items
    where indexed_folder_id = ${folderId}
      and deleted = false
  `;
  const [updated] = await sql<IndexedFolderRow[]>`
    update indexed_folders
    set item_count = ${countRow?.count || 0},
        sync_status = ${status},
        sync_cursor = ${cursor === undefined ? sql`sync_cursor` : cursor},
        delta_link = ${deltaLink === undefined ? sql`delta_link` : deltaLink},
        last_sync_at = ${status === "idle" ? sql`now()` : sql`last_sync_at`},
        last_error = ${error},
        updated_at = now()
    where id = ${folderId}
    returning id,
              account_id,
              drive_id,
              folder_id,
              folder_name,
              folder_path,
              enabled,
              item_count,
              last_sync_at,
              delta_link,
              sync_cursor,
              sync_status,
              last_error
  `;

  return updated;
}

export async function POST(request: Request, context: RouteContext) {
  const sql = getSql();

  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = syncRequestSchema.parse(await request.json().catch(() => ({}))) || {};
    const maxPages = body.maxPages || 2;
    const [folder] = await sql<IndexedFolderRow[]>`
      select id,
             account_id,
             drive_id,
             folder_id,
             folder_name,
             folder_path,
             enabled,
             item_count,
             last_sync_at,
             delta_link,
             sync_cursor,
             sync_status,
             last_error
      from indexed_folders
      where id = ${id}
        and account_id = ${session.accountId}
        and enabled = true
      limit 1
    `;

    if (!folder) {
      return jsonError("Folder not found", 404);
    }

    if (body.full) {
      await sql`
        update drive_items
        set deleted = true,
            updated_at = now()
        where indexed_folder_id = ${folder.id}
          and account_id = ${session.accountId}
      `;
      folder.delta_link = null;
      folder.sync_cursor = null;
    }

    await sql`
      update indexed_folders
      set sync_status = 'syncing',
          last_error = null,
          updated_at = now()
      where id = ${folder.id}
    `;

    let url = folder.sync_cursor || folder.delta_link || initialDeltaUrl(folder);
    let processedPages = 0;
    let processedItems = 0;
    let nextCursor: string | null = null;
    let deltaLink: string | null = folder.delta_link;

    while (processedPages < maxPages && url) {
      const page = await graphFetchJson<GraphCollection<GraphDriveItem>>(session.accessToken, url);

      for (const item of page.value) {
        await upsertGraphItem(folder, item);
        processedItems += 1;
      }

      processedPages += 1;

      if (page["@odata.nextLink"]) {
        nextCursor = page["@odata.nextLink"];
        url = nextCursor;
        continue;
      }

      nextCursor = null;
      deltaLink = page["@odata.deltaLink"] || deltaLink;
      url = "";
    }

    const status = nextCursor ? "syncing" : "idle";
    const updated = await refreshFolderCount(folder.id, status, null, nextCursor, deltaLink);

    return Response.json({
      folder: serializeFolder(updated),
      hasMore: Boolean(nextCursor),
      processedPages,
      processedItems,
    });
  } catch (error) {
    console.error(error);

    if (error instanceof GraphError) {
      const { id } = await context.params;
      const status = error.status === 429 || error.status === 503 ? "paused" : "error";
      const updated = await refreshFolderCount(id, status, error.message);

      return Response.json(
        {
          error: error.message,
          retryAfter: error.retryAfter,
          folder: updated ? serializeFolder(updated) : null,
        },
        { status: error.status === 429 || error.status === 503 ? 429 : 502 },
      );
    }

    return jsonError("Could not sync folder", error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
  }
}
