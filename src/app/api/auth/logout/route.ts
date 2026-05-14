import { NextResponse } from "next/server";

import { deleteCurrentSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await deleteCurrentSession();

  return NextResponse.redirect(new URL("/", request.url));
}
