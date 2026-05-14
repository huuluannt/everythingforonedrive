import { requireSession } from "@/lib/auth";
import { graphFetchJson, graphItemPath, type GraphCollection, type GraphDriveItem } from "@/lib/graph";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function folderEndpoint(parentId: string | null) {
  const select = "$select=id,name,parentReference,folder,webUrl,lastModifiedDateTime,size";
  const order = "$orderby=name";
  const top = "$top=200";

  if (!parentId || parentId === "root") {
    return `/me/drive/root/children?${select}&${order}&${top}`;
  }

  return `/me/drive/items/${encodeURIComponent(parentId)}/children?${select}&${order}&${top}`;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const parentId = new URL(request.url).searchParams.get("parentId");
    const data = await graphFetchJson<GraphCollection<GraphDriveItem>>(
      session.accessToken,
      folderEndpoint(parentId),
    );

    return Response.json({
      folders: data.value
        .filter((item) => item.folder)
        .map((item) => ({
          driveId: item.parentReference?.driveId,
          folderId: item.id,
          folderName: item.name || "Untitled folder",
          folderPath: graphItemPath(item),
          webUrl: item.webUrl,
        }))
        .filter((item) => item.driveId),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not load OneDrive folders", error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
  }
}
