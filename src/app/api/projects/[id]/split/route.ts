import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { diskPath } from "@/lib/storage";
import { getSettings } from "@/lib/settings";
import { splitScriptIntoShots } from "@/lib/llm/shotSplitter";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const settings = await getSettings();

  let shots;
  try {
    shots = await splitScriptIntoShots(project.script, settings);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "拆分镜头失败" },
      { status: 502 },
    );
  }

  // Capture the outgoing shot ids so their narration files can be removed —
  // re-splitting discards every shot, and the audio on disk would otherwise be
  // orphaned with no row left pointing at it.
  const previousShots = await prisma.shot.findMany({
    where: { projectId: id },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.shot.deleteMany({ where: { projectId: id } }),
    prisma.project.update({
      where: { id },
      data: {
        status: "ready",
        shots: {
          create: shots.map((shot, index) => ({
            order: index,
            text: shot.text,
            description: shot.description,
            keywordsZh: shot.keywords_zh.join(","),
            keywordsEn: shot.keywords_en.join(","),
          })),
        },
      },
    }),
  ]);

  await Promise.all(
    previousShots.map((s) =>
      fs.rm(diskPath("audio", s.id), { recursive: true, force: true }).catch(() => {}),
    ),
  );

  const updated = await prisma.project.findUnique({
    where: { id },
    include: { shots: { orderBy: { order: "asc" }, include: { audio: true } } },
  });
  return NextResponse.json(updated);
}
