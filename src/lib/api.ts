import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { toApiError } from "@/lib/errors";

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function requestIdOf(request: Request): string {
  const existing = request.headers.get("x-request-id");
  return existing && existing.length <= 120 ? existing : randomUUID();
}

export function apiOk<T>(
  data: T,
  requestId: string,
  meta: ApiMeta | null = null,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json(
    { success: true, data, error: null, meta },
    {
      ...init,
      headers: {
        "X-Request-ID": requestId,
        "Cache-Control": "no-store",
        ...(init?.headers ?? {}),
      },
    },
  );
}

export function apiError(error: unknown, requestId: string): NextResponse {
  const { status, body } = toApiError(error);
  return NextResponse.json(body, {
    status,
    headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" },
  });
}

export function searchObject(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const result: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (value !== "") result[key] = value;
  });
  return result;
}

export function paginationMeta(page: number, limit: number, total: number): ApiMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
