import { ZodError, type ZodTypeAny, type output } from "zod";
import { AppError, isAppError, type AppErrorCode } from "./errors/app-error";
import { getLocale } from "next-intl/server";
import { isLocale } from "@/i18n/config";
import { localizeFieldErrors, localizeServerText } from "@/i18n/server-text";
import { logger } from "./logger";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; fieldErrors?: Record<string, string[]> } };

export function parseInput<S extends ZodTypeAny>(schema: S, input: unknown): output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Please check the highlighted fields.", {
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }
  return result.data;
}

async function localize<T>(result: ActionResult<T>): Promise<ActionResult<T>> {
  if (result.ok) return result;
  const locale = await getLocale().catch(() => "en");
  if (!isLocale(locale) || locale === "en") return result;
  return {
    ok: false,
    error: {
      ...result.error,
      message: localizeServerText(result.error.message, locale),
      fieldErrors: result.error.fieldErrors ? localizeFieldErrors(result.error.fieldErrors, locale) : undefined,
    },
  };
}

/** Uniform error boundary for Server Actions: typed result, never a thrown stack to the client. */
export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  return localize(await runActionRaw(name, fn));
}

async function runActionRaw<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAppError(error)) {
      const level = error.code === "INTERNAL" ? "error" : "warn";
      logger[level]("action.failed", { action: name, code: error.code, message: error.message, cause: error.cause });
      return { ok: false, error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } };
    }
    if (error instanceof ZodError) {
      logger.error("action.invalid_response", { action: name, issues: error.issues });
      return { ok: false, error: { code: "INTERNAL", message: "Unexpected server response." } };
    }
    logger.error("action.crashed", { action: name, error });
    return { ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } };
  }
}
