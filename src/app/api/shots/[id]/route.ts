import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { diskPath } from "@/lib/storage";

const patchSchema = z.object({ text: z.string().trim().min(1) });

// Editing a shot's narration text invalidates whatever audio/subtitles were
// generated for the old text — they'd no longer match what's read aloud.
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

  const existing = await prisma.shot.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const textChanged = existing.text !== parsed.data.text;

  const [shot] = await prisma.$transaction([
    prisma.shot.update({
      where: { id },
      data: {
        text: parsed.data.text,
        ...(textChanged ? { durationMs: null } : {}),
      },
      include: { audio: true },
    }),
    ...(textChanged
      ? [
          prisma.audioSegment.deleteMany({ where: { shotId: id } }),
          prisma.subtitleSegment.deleteMany({ where: { shotId: id } }),
        ]
      : []),
  ]);

  return NextResponse.json(textChanged ? { ...shot, audio: null } : shot);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.shot.delete({ where: { id } }).catch(() => null);
  await fs.rm(diskPath("audio", id), { recursive: true, force: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
