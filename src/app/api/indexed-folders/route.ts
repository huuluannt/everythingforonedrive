import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const indexedFolderSchema = z.object({
  driveId: z.string().min(1),
  folderId: z.string().min(1),
  folderName: z.string().min(1),
  folderPath: z.string().min(1),
});

function serializeFolder(row: Record<string, unknown>) {
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

export async function GET() {
  try {
    const session = await requireSession();
    const rows = await getSql()`
      select id,
             drive_id,
             folder_id,
             folder_name,
             folder_path,
             enabled,
             item_count,
             last_sync_at,
             sync_status,
             last_error
      from indexed_folders
      where account_id = ${session.accountId}
      order by enabled desc, folder_path asc
    `;

    return Response.json({ folders: rows.map(serializeFolder) });
  } catch (error) {
    console.error(error);
    return jsonError("Could not load indexed folders", error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = indexedFolderSchema.parse(await request.json());
    const [row] = await getSql()`
      insert into indexed_folders (
        account_id,
        drive_id,
        folder_id,
        folder_name,
        folder_path,
        enabled,
        sync_status,
        last_error,
        updated_at
      ) values (
        ${session.accountId},
        ${body.driveId},
        ${body.folderId},
        ${body.folderName},
        ${body.folderPath},
        true,
        'pending',
        null,
        now()
      )
      on conflict (account_id, drive_id, folder_id)
      do update set enabled = true,
                    folder_name = excluded.folder_name,
                    folder_path = excluded.folder_path,
                    sync_status = 'pending',
                    last_error = null,
                    updated_at = now()
      returning id,
                drive_id,
                folder_id,
                folder_name,
                folder_path,
                enabled,
                item_count,
                last_sync_at,
                sync_status,
                last_error
    `;

    return Response.json({ folder: serializeFolder(row) });
  } catch (error) {
    console.error(error);
    return jsonError("Could not save indexed folder", error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
