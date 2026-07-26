import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { synthesizeShotAudio, DEFAULT_VOICE } from "@/lib/tts/edgeTts";
import { regenerateShotCues } from "@/lib/shots/cues";

// Single-shot regenerate stays inline: it's one short TTS call, so a background
// job would be more machinery than the wait it saves.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shot = await prisma.shot.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!shot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let audio;
  try {
    audio = await synthesizeShotAudio(shot.id, shot.text, shot.project.voice || DEFAULT_VOICE);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "配音生成失败" },
      { status: 502 },
    );
  }

  const [audioSegment] = await prisma.$transaction([
    prisma.audioSegment.upsert({
      where: { shotId: shot.id },
      create: {
        shotId: shot.id,
        filePath: audio.publicPath,
        durationMs: audio.durationMs,
        provider: "edge-tts",
      },
      update: { filePath: audio.publicPath, durationMs: audio.durationMs },
    }),
    prisma.shot.update({ where: { id: shot.id }, data: { durationMs: audio.durationMs } }),
  ]);

  await regenerateShotCues(
    shot.id,
    shot.text,
    audio.durationMs,
    shot.project.aspectRatio,
  );

  return NextResponse.json(audioSegment);
}
