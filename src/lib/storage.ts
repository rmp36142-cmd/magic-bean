import path from "node:path";
import fs from "node:fs/promises";

// Everything generated at runtime (TTS audio, downloaded material, uploads,
// exported mp4s) lives under public/storage so it's directly reachable over
// HTTP without a dedicated streaming route. Gitignored — see .gitignore.
const STORAGE_ROOT = path.join(process.cwd(), "public", "storage");
const PUBLIC_PREFIX = "/storage/";

export function diskPath(...segments: string[]): string {
  return path.join(STORAGE_ROOT, ...segments);
}

export function publicUrl(...segments: string[]): string {
  return PUBLIC_PREFIX + path.posix.join(...segments);
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function isLocalStorageUrl(url: string): boolean {
  return url.startsWith(PUBLIC_PREFIX);
}

// Inverse of publicUrl: "/storage/audio/x/audio.mp3" -> absolute disk path.
//
// Resolves and then verifies containment. Callers pass values that came out of
// the database, and those in turn can originate from an upload's filename or a
// third-party API payload, so a "../.." segment must not be able to walk out
// of the storage root.
export function publicUrlToDiskPath(url: string): string {
  const relative = url.startsWith(PUBLIC_PREFIX) ? url.slice(PUBLIC_PREFIX.length) : url;
  const resolved = path.resolve(STORAGE_ROOT, relative);
  const rootWithSep = STORAGE_ROOT.endsWith(path.sep) ? STORAGE_ROOT : STORAGE_ROOT + path.sep;
  if (resolved !== STORAGE_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`非法的存储路径: ${url}`);
  }
  return resolved;
}
