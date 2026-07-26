import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { diskPath } from "@/lib/storage";

const MATERIAL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

async function dirSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await dirSize(full);
      bytes += sub.bytes;
      files += sub.files;
    } else {
      const stat = await fs.stat(full).catch(() => null);
      if (stat) {
        bytes += stat.size;
        files += 1;
      }
    }
  }
  return { bytes, files };
}

// The generated-file areas grow monotonically otherwise: the material cache is
// content-addressed and shared across projects (so project deletion can't prune
// it), and export directories outlive the jobs that made them.
export async function GET() {
  const areas = ["materials", "exports", "audio", "music", "uploads"] as const;
  const report = await Promise.all(
    areas.map(async (area) => ({ area, ...(await dirSize(diskPath(area))) })),
  );
  return NextResponse.json({
    areas: report,
    totalBytes: report.reduce((sum, r) => sum + r.bytes, 0),
  });
}

export async function POST() {
  let removedFiles = 0;
  let freedBytes = 0;

  // 1. Material cache entries not touched in a week. Safe to drop: they are
  //    re-downloaded / re-rendered on demand, keyed by content.
  const materialsDir = diskPath("materials");
  const cutoff = Date.now() - MATERIAL_CACHE_MAX_AGE_MS;
  for (const name of await fs.readdir(materialsDir).catch(() => [])) {
    const full = path.join(materialsDir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    if (stat.mtimeMs < cutoff) {
      freedBytes += stat.size;
      removedFiles += 1;
      await fs.rm(full, { force: true }).catch(() => {});
    }
  }

  // 2. Export directories whose Job row is gone (or which never produced an
  //    output because the job failed partway).
  const exportsDir = diskPath("exports");
  const jobIds = new Set((await prisma.job.findMany({ select: { id: true } })).map((j) => j.id));
  const liveOutputs = new Set(
    (await prisma.job.findMany({ where: { status: "done" }, select: { outputPath: true } }))
      .map((j) => j.outputPath)
      .filter((p): p is string => Boolean(p)),
  );
  for (const name of await fs.readdir(exportsDir).catch(() => [])) {
    const full = path.join(exportsDir, name);
    const keep =
      jobIds.has(name) && liveOutputs.has(`/storage/exports/${name}/output.mp4`);
    if (keep) continue;
    const size = await dirSize(full);
    freedBytes += size.bytes;
    removedFiles += size.files;
    await fs.rm(full, { recursive: true, force: true }).catch(() => {});
  }

  // 3. Per-shot narration directories for shots that no longer exist.
  const audioDir = diskPath("audio");
  const shotIds = new Set((await prisma.shot.findMany({ select: { id: true } })).map((s) => s.id));
  for (const name of await fs.readdir(audioDir).catch(() => [])) {
    if (shotIds.has(name)) continue;
    const full = path.join(audioDir, name);
    const size = await dirSize(full);
    freedBytes += size.bytes;
    removedFiles += size.files;
    await fs.rm(full, { recursive: true, force: true }).catch(() => {});
  }

  // 4. Uploads with no UserMaterial row behind them.
  const uploadsDir = diskPath("uploads");
  const uploadNames = new Set(
    (await prisma.userMaterial.findMany({ select: { filePath: true } })).map((m) =>
      path.basename(m.filePath),
    ),
  );
  for (const name of await fs.readdir(uploadsDir).catch(() => [])) {
    if (uploadNames.has(name)) continue;
    const full = path.join(uploadsDir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile()) continue;
    freedBytes += stat.size;
    removedFiles += 1;
    await fs.rm(full, { force: true }).catch(() => {});
  }

  return NextResponse.json({ removedFiles, freedBytes });
}
