import { getCurrentSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return Response.json({ authenticated: false });
  }

  return Response.json({
    authenticated: true,
    sessionToken: session.sessionToken,
    user: {
      id: session.accountId,
      displayName: session.displayName,
      email: session.email,
    },
  });
}
