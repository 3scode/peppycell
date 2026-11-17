import "server-only";
import { ZodError } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { toActionError } from "@/lib/errors";
import type { ActionResult, SessionUser, UserRole } from "@/types/domain";

export function withAction<TInput, TOutput>(
  _name: string,
  roles: UserRole[],
  schema: { parse: (input: unknown) => TInput },
  handler: (input: TInput, ctx: { user: SessionUser }) => Promise<TOutput> | TOutput,
) {
  return async (raw: unknown): Promise<ActionResult<TOutput>> => {
    try {
      const user = await getSessionUser();
      if (!user) {
        return {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Sesi tidak valid. Silakan login ulang." },
        };
      }
      if (roles.length > 0 && !roles.includes(user.role)) {
        return {
          ok: false,
          error: { code: "FORBIDDEN", message: "Anda tidak punya akses ke aksi ini." },
        };
      }
      const input = schema.parse(raw);
      const data = await handler(input, { user });
      return { ok: true, data };
    } catch (error) {
      if (error instanceof ZodError) return toActionError(error);
      return toActionError(error);
    }
  };
}
