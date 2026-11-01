type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, event: string, context: Record<string, unknown> = {}) {
  const entry = { level, event, time: new Date().toISOString(), ...context };
  const line = JSON.stringify(entry, (_key, value) =>
    value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
  );
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug" && process.env.NODE_ENV === "production") return;
  else console.log(line);
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => write("debug", event, context),
  info: (event: string, context?: Record<string, unknown>) => write("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => write("warn", event, context),
  error: (event: string, context?: Record<string, unknown>) => write("error", event, context),
};
