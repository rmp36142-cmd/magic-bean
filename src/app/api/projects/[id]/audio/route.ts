import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { synthesizeShotAudio } from "@/lib/tts/edgeTts";

// Generates narration for every shot in the project that doesn't have it
// yet. Sequential on purpose — one WebSocket connection to the TTS service
// at a time is friendlier than bursting N of them at once.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shots = await prisma.shot.findMany({
    where: { projectId: id },
    include: { audio: true },
    orderBy: { order: "asc" },
  });
  if (shots.length === 0) {
    return NextResponse.json({ error: "还没有分镜" }, { status: 400 });
  }

  const errors: { shotId: string; error: string }[] = [];
  for (const shot of shots) {
    if (shot.audio) continue;
    try {
      const audio = await synthesizeShotAudio(shot.id, shot.text);
      await prisma.$transaction([
        prisma.audioSegment.upsert({
          where: { shotId: shot.id },
          create: { shotId: shot.id, filePath: audio.publicPath, durationMs: audio.durationMs },
          update: { filePath: audio.publicPath, durationMs: audio.durationMs },
        }),
        prisma.shot.update({ where: { id: shot.id }, data: { durationMs: audio.durationMs } }),
        prisma.subtitleSegment.deleteMany({ where: { shotId: shot.id } }),
      ]);
      await prisma.subtitleSegment.create({
        data: { shotId: shot.id, text: shot.text, startMs: 0, endMs: audio.durationMs },
      });
    } catch (err) {
      errors.push({
        shotId: shot.id,
        error: err instanceof Error ? err.message : "配音生成失败",
      });
    }
  }

  const updated = await prisma.project.findUnique({
    where: { id },
    include: {
      shots: { orderBy: { order: "asc" }, include: { audio: true, subtitles: true } },
    },
  });

  return NextResponse.json({ project: updated, errors });
}
