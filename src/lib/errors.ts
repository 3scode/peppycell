import { ZodError } from "zod";
import type { ActionResult } from "@/types/domain";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_BALANCE"
  | "SAME_WALLET"
  | "WALLET_INACTIVE"
  | "PRODUCT_INACTIVE"
  | "PRODUCT_COST_MISSING"
  | "INVALID_MARGIN"
  | "DEFAULT_WALLET_MISSING"
  | "INVALID_ALLOCATION"
  | "DUPLICATE_PAYOUT"
  | "PAYOUT_LOSS"
  | "PAYOUT_PERIOD_OPEN"
  | "HISTORICAL_PERIOD"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_BALANCE: 422,
  SAME_WALLET: 422,
  WALLET_INACTIVE: 422,
  PRODUCT_INACTIVE: 422,
  PRODUCT_COST_MISSING: 422,
  INVALID_MARGIN: 422,
  DEFAULT_WALLET_MISSING: 422,
  INVALID_ALLOCATION: 422,
  DUPLICATE_PAYOUT: 409,
  PAYOUT_LOSS: 422,
  PAYOUT_PERIOD_OPEN: 422,
  HISTORICAL_PERIOD: 422,
  IDEMPOTENCY_CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function toActionError<T>(error: unknown): ActionResult<T> {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Periksa kembali input Anda.",
        fieldErrors,
      },
    };
  }
  if (error instanceof Error) {
    const coded = error as Error & { code?: string };
    if (coded.code && coded.code in STATUS) {
      return {
        ok: false,
        error: { code: coded.code, message: error.message },
      };
    }
    return { ok: false, error: { code: "INTERNAL_ERROR", message: error.message } };
  }
  return { ok: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan tak terduga." } };
}

export function toApiError(error: unknown): {
  status: number;
  body: {
    success: false;
    data: null;
    error: { code: string; message: string; details?: Record<string, unknown> };
    meta: null;
  };
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        success: false,
        data: null,
        error: { code: error.code, message: error.message, details: error.details },
        meta: null,
      },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 422,
      body: {
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Periksa kembali input Anda.",
          details: { fieldErrors: error.flatten().fieldErrors },
        },
        meta: null,
      },
    };
  }
  return {
    status: 500,
    body: {
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server." },
      meta: null,
    },
  };
}
