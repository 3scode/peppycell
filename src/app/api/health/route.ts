import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { APP_NAME, isSupabaseConfigured } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function countRows(table: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function GET() {
  const requestId = randomUUID();
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          success: false,
          data: {
            status: "unconfigured",
            app: APP_NAME,
            mode: "supabase",
            db: "missing-env",
            version: process.env.npm_package_version ?? "1.0.0",
            timestamp: new Date().toISOString(),
          },
          error: { code: "INTERNAL_ERROR", message: "Supabase belum dikonfigurasi." },
          meta: null,
        },
        { status: 503, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } },
      );
    }

    const [users, products, wallets, transactions] = await Promise.all([
      countRows("users"),
      countRows("products"),
      countRows("wallets"),
      countRows("transactions"),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          status: "ok",
          app: APP_NAME,
          mode: "supabase",
          db: "connected",
          version: process.env.npm_package_version ?? "1.0.0",
          counts: { users, products, wallets, transactions },
          timestamp: new Date().toISOString(),
        },
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "INTERNAL_ERROR", message: "Health check gagal." },
        meta: null,
      },
      {
        status: 503,
        headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" },
      },
    );
  }
}
