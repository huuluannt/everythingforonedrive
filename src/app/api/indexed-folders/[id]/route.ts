import { requireSession } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const sql = getSql();
    const [folder] = await sql`
      update indexed_folders
      set enabled = false,
          item_count = 0,
          sync_status = 'disabled',
          sync_cursor = null,
          updated_at = now()
      where id = ${id}
        and account_id = ${session.accountId}
      returning id
    `;

    if (!folder) {
      return jsonError("Folder not found", 404);
    }

    await sql`
      delete from drive_items
      where indexed_folder_id = ${id}
        and account_id = ${session.accountId}
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("Could not remove indexed folder", error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
  }
}
