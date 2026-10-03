import { NextResponse } from "next/server";
import { toDateKey } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { exportUserData } from "@/server/services/users";

export const dynamic = "force-dynamic";

/** Derecho a conocer: descarga todos los datos del usuario actual en JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const data = await exportUserData(db, user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finora-${user.username}-${toDateKey(new Date())}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
