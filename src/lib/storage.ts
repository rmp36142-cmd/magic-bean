import path from "node:path";
import fs from "node:fs/promises";

// Everything generated at runtime (TTS audio, downloaded material, exported
// mp4s) lives under public/storage so it's directly reachable over HTTP
// without a dedicated streaming route. Gitignored — see .gitignore.
const STORAGE_ROOT = path.join(process.cwd(), "public", "storage");

export function diskPath(...segments: string[]): string {
  return path.join(STORAGE_ROOT, ...segments);
}

export function publicUrl(...segments: string[]): string {
  return "/" + path.posix.join("storage", ...segments);
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// Inverse of publicUrl: "/storage/audio/x/audio.mp3" -> absolute disk path.
export function publicUrlToDiskPath(url: string): string {
  const relative = url.replace(/^\/storage\//, "");
  return diskPath(relative);
}
