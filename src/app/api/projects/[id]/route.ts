import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { diskPath } from "@/lib/storage";
import { regenerateProjectCues } from "@/lib/shots/cues";

const patchSchema = z.object({
  transitionsEnabled: z.boolean().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  voice: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const before = await prisma.project.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const updated = await prisma.project.update({ where: { id }, data: parsed.data });

  // Subtitle cue length is a function of frame width, so switching between
  // landscape and vertical has to re-cut the cues for every narrated shot.
  if (parsed.data.aspectRatio && parsed.data.aspectRatio !== before.aspectRatio) {
    await regenerateProjectCues(id);
  }

  return NextResponse.json(updated);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { shots: { orderBy: { order: "asc" } } },
  });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  const shots = await prisma.shot.findMany({ where: { projectId: id }, select: { id: true } });
  const jobs = await prisma.job.findMany({ where: { projectId: id }, select: { id: true } });

  // DB rows first (cascades shots/audio/subtitles/candidates/jobs); best-effort
  // disk cleanup after, since a stray directory is harmless but an orphaned DB
  // row referencing a deleted file isn't. Note: the material cache under
  // storage/materials/ is content-addressed and shared across projects, so it's
  // intentionally left alone here (see /api/storage/prune).
  await prisma.project.delete({ where: { id } }).catch(() => null);

  await Promise.all([
    ...shots.map((s) =>
      fs.rm(diskPath("audio", s.id), { recursive: true, force: true }).catch(() => {}),
    ),
    ...jobs.map((j) =>
      fs.rm(diskPath("exports", j.id), { recursive: true, force: true }).catch(() => {}),
    ),
    // The uploaded music keeps its original extension, so deriving the filename
    // from the stored path is the only way to actually find it.
    project?.backgroundMusicPath
      ? fs
          .rm(diskPath("music", `${id}${path.extname(project.backgroundMusicPath)}`), {
            force: true,
          })
          .catch(() => {})
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
