import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { synthesizeShotAudio } from "@/lib/tts/edgeTts";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let audio;
  try {
    audio = await synthesizeShotAudio(shot.id, shot.text);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "配音生成失败" },
      { status: 502 },
    );
  }

  const [audioSegment] = await prisma.$transaction([
    prisma.audioSegment.upsert({
      where: { shotId: shot.id },
      create: { shotId: shot.id, filePath: audio.publicPath, durationMs: audio.durationMs },
      update: { filePath: audio.publicPath, durationMs: audio.durationMs },
    }),
    prisma.subtitleSegment.deleteMany({ where: { shotId: shot.id } }),
    prisma.shot.update({ where: { id: shot.id }, data: { durationMs: audio.durationMs } }),
  ]);

  await prisma.subtitleSegment.create({
    data: { shotId: shot.id, text: shot.text, startMs: 0, endMs: audio.durationMs },
  });

  return NextResponse.json(audioSegment);
}
