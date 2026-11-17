#!/usr/bin/env bun
/**
 * Smoke test staging/production.
 *
 * Pemakaian:
 *   bun run smoke:staging
 *   bun run smoke:production
 *   bun scripts/smoke.ts --env=staging --base=https://...
 *
 * Env: STAGING_APP_URL, PRODUCTION_APP_URL, SMOKE_BASE_URL.
 */
export {};
function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

const envName = arg("env") ?? "staging";
const baseUrl =
  arg("base") ??
  process.env.SMOKE_BASE_URL ??
  (envName === "production" ? process.env.PRODUCTION_APP_URL : process.env.STAGING_APP_URL) ??
  process.env.NEXT_PUBLIC_APP_URL;

if (!baseUrl) {
  console.error("Base URL tidak diketahui. Set SMOKE_BASE_URL atau STAGING_APP_URL.");
  process.exit(1);
}

const target = baseUrl.replace(/\/$/, "");
const results: { name: string; ok: boolean; detail: string }[] = [];

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✔ ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.error(`✖ ${name} — ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log(`Smoke test ${envName}: ${target}\n`);

await check("GET /api/health", async () => {
  const response = await fetch(`${target}/api/health`, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "peppycell-smoke/1.0" },
  });
  assert(response.ok, `status ${response.status}`);
  const body = (await response.json()) as {
    success?: boolean;
    data?: { status?: string; mode?: string };
  };
  assert(body.success === true, "envelope success bukan true");
  assert(body.data?.status === "ok", `status ${body.data?.status}`);
  return `200 · mode=${body.data?.mode ?? "?"}`;
});

await check("GET /login", async () => {
  const response = await fetch(`${target}/login`, {
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `status ${response.status}`);
  const html = await response.text();
  assert(html.includes("PeppyCell"), "halaman login tidak memuat PeppyCell");
  return "200 · halaman login";
});

await check("GET /api/me tanpa sesi = 401", async () => {
  const response = await fetch(`${target}/api/me`, {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  });
  assert(response.status === 401, `status ${response.status}, seharusnya 401`);
  const body = (await response.json()) as { success?: boolean; error?: { code?: string } };
  assert(body.success === false, "envelope error tidak valid");
  assert(body.error?.code === "UNAUTHORIZED", `code ${body.error?.code}`);
  return "401 · UNAUTHORIZED";
});

await check("Header keamanan", async () => {
  const response = await fetch(`${target}/login`, {
    signal: AbortSignal.timeout(15_000),
  });
  const frame = response.headers.get("x-frame-options");
  const nosniff = response.headers.get("x-content-type-options");
  assert(frame === "DENY", `X-Frame-Options=${frame}`);
  assert(nosniff === "nosniff", `X-Content-Type-Options=${nosniff}`);
  return "DENY + nosniff";
});

const failed = results.filter((item) => !item.ok);
console.log("");
if (failed.length > 0) {
  console.error(`${failed.length}/${results.length} check gagal.`);
  process.exit(1);
}
console.log(`Semua ${results.length} check lulus.`);
