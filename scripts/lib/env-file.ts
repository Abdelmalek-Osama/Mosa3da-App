import { existsSync, readFileSync, appendFileSync } from "node:fs";

/** Minimal .env parser (KEY=VALUE, # comments, optional quotes). */
export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function appendEnv(path: string, entries: Record<string, string>, comment: string) {
  const body = Object.entries(entries)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  appendFileSync(path, `\n# ${comment}\n${body}\n`);
}

/** process.env wins over the file, so CI / Vercel values are respected. */
export function loadEnv(path = ".env.local"): Record<string, string> {
  const merged = { ...readEnvFile(path) };
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && v !== "") merged[k] = v;
  for (const [k, v] of Object.entries(merged)) if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
  return merged;
}
