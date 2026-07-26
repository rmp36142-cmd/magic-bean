import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { diskPath } from "@/lib/storage";
import fs from "node:fs/promises";

const patchSchema = z.object({ transitionsEnabled: z.boolean() });

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
  const updated = await prisma.project.update({ where: { id }, data: parsed.data });
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
  const shots = await prisma.shot.findMany({ where: { projectId: id }, select: { id: true } });
  const exportJobs = await prisma.exportJob.findMany({ where: { projectId: id }, select: { id: true } });

  // DB rows first (cascades shots/audio/subtitles/candidates/export jobs);
  // best-effort disk cleanup after, since a stray directory is harmless but
  // an orphaned DB row referencing a deleted file isn't. Note: the material
  // cache under storage/materials/ is content-addressed and shared across
  // projects, so it's intentionally left alone here.
  await prisma.project.delete({ where: { id } }).catch(() => null);

  await Promise.all([
    ...shots.map((s) => fs.rm(diskPath("audio", s.id), { recursive: true, force: true }).catch(() => {})),
    ...exportJobs.map((j) => fs.rm(diskPath("exports", j.id), { recursive: true, force: true }).catch(() => {})),
    fs.rm(diskPath("music", `${id}.mp3`), { force: true }).catch(() => {}),
  ]);

  return NextResponse.json({ ok: true });
}
