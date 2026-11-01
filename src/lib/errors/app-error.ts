export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE"
  | "VALIDATION"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: Record<string, string[]>;
  readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { fieldErrors?: Record<string, string[]>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options.fieldErrors;
    this.cause = options.cause;
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;
