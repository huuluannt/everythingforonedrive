import { requireSession } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { parseSearchQuery } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let searchExtensionReady = false;

function resultLimit(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.min(Math.max(1, Math.trunc(parsed)), 100);
}

function resultSort(value: string | null) {
  if (value === "name" || value === "modified" || value === "size") {
    return value;
  }

  return "relevance";
}

async function ensureSearchExtension(sql: ReturnType<typeof getSql>) {
  if (searchExtensionReady) {
    return;
  }

  await sql`create extension if not exists unaccent`;
  searchExtensionReady = true;
}

function searchTermCondition(
  sql: ReturnType<typeof getSql>,
  column: "search_text" | "path_search_text",
  term: string,
) {
  if (term.length <= 2) {
    return column === "search_text"
      ? sql`search_text like ${`% ${term} %`}`
      : sql`path_search_text like ${`% ${term} %`}`;
  }

  return column === "search_text"
    ? sql`search_text like ${`%${term}%`}`
    : sql`path_search_text like ${`%${term}%`}`;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const parsed = parseSearchQuery(url.searchParams.get("q") || "");
    const limit = resultLimit(url.searchParams.get("limit"));
    const sort = resultSort(url.searchParams.get("sort"));
    const sql = getSql();
    await ensureSearchExtension(sql);

    const baseConditions = [
      sql`account_id = ${session.accountId}`,
      sql`deleted = false`,
    ];

    if (parsed.extensions.length > 0) {
      baseConditions.push(sql`extension in ${sql(parsed.extensions)}`);
    }

    if (parsed.itemType) {
      baseConditions.push(sql`item_type = ${parsed.itemType}`);
    }

    const searchConditions = parsed.searchTerms.map((term) =>
      searchTermCondition(sql, "search_text", term),
    );

    if (parsed.pathKeyword) {
      searchConditions.push(searchTermCondition(sql, "path_search_text", parsed.pathKeyword));
    }

    const baseWhere = baseConditions.reduce((left, right) => sql`${left} and ${right}`);
    const searchWhere = searchConditions.length > 0
      ? searchConditions.reduce((left, right) => sql`${left} and ${right}`)
      : sql`true`;
    const exact = parsed.normalizedText;
    const exactName = ` ${parsed.normalizedText} `;
    const prefix = ` ${parsed.normalizedText}%`;
    const substring = `% ${parsed.normalizedText}%`;
    const rows = await sql`
      with searchable_items as (
        select id,
               drive_id,
               indexed_folder_id,
               item_id,
               parent_id,
               name,
               item_type,
               extension,
               size,
               modified_date_time,
               web_url,
               path,
               normalized_name,
               ' ' || regexp_replace(lower(unaccent(coalesce(normalized_name, ''))), '[^[:alnum:]]+', ' ', 'g') || ' ' as name_search_text,
               ' ' || regexp_replace(lower(unaccent(coalesce(path, ''))), '[^[:alnum:]]+', ' ', 'g') || ' ' as path_search_text,
               ' ' || regexp_replace(
                 lower(unaccent(coalesce(normalized_name, '') || ' ' || coalesce(path, ''))),
                 '[^[:alnum:]]+',
                 ' ',
                 'g'
               ) || ' ' as search_text
        from drive_items
        where ${baseWhere}
      ),
      ranked_items as (
        select id,
               drive_id,
               indexed_folder_id,
               item_id,
               parent_id,
               name,
               item_type,
               extension,
               size,
               modified_date_time,
               web_url,
               path,
               normalized_name,
               name_search_text,
               case
                 when ${exact} <> '' and name_search_text = ${exactName} then 0
                 when ${exact} <> '' and name_search_text like ${prefix} then 1
                 when ${exact} <> '' and search_text like ${substring} then 2
                 else 3
               end as search_rank
        from searchable_items
        where ${searchWhere}
      )
      select id,
             drive_id,
             indexed_folder_id,
             item_id,
             parent_id,
             name,
             item_type,
             extension,
             size,
             modified_date_time,
             web_url,
             path,
             search_rank as rank
      from ranked_items
      order by case when item_type = 'folder' then 0 else 1 end asc,
               case when ${sort} = 'relevance' then search_rank end asc,
               case when ${sort} = 'modified' then modified_date_time end desc nulls last,
               case when ${sort} = 'name' then normalized_name end asc,
               case when ${sort} = 'size' then size end desc nulls last,
               search_rank asc,
               modified_date_time desc nulls last,
               normalized_name asc
      limit ${limit}
    `;

    return Response.json({
      query: parsed,
      limit,
      sort,
      results: rows.map((row) => ({
        id: row.id,
        driveId: row.drive_id,
        indexedFolderId: row.indexed_folder_id,
        itemId: row.item_id,
        parentId: row.parent_id,
        name: row.name,
        itemType: row.item_type,
        extension: row.extension,
        size: row.size,
        modifiedDateTime: row.modified_date_time,
        webUrl: row.web_url,
        path: row.path,
        rank: row.rank,
      })),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not search indexed items", error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
  }
}
