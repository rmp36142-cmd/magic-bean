import { prisma } from "@/lib/db";
import { composeProject, type ExportableShot } from "@/lib/ffmpeg/pipeline";
import { runJob } from "@/lib/jobs/runner";
import { resolveAspect } from "@/lib/aspect";

export async function runExportJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  await runJob(jobId, async (progress) => {
    const project = await prisma.project.findUnique({ where: { id: job.projectId } });
    if (!project) throw new Error("项目不存在");

    const shots = await prisma.shot.findMany({
      where: { projectId: job.projectId },
      orderBy: { order: "asc" },
      include: { audio: true, subtitles: { orderBy: { order: "asc" } } },
    });

    const exportable: ExportableShot[] = shots.map((s) => ({
      id: s.id,
      text: s.text,
      materialType: s.materialType ?? "",
      materialUrl: s.materialUrl ?? "",
      durationMs: s.durationMs ?? 0,
      audioPublicPath: s.audio?.filePath ?? "",
      subtitles: s.subtitles.map((c) => ({
        text: c.text,
        startMs: c.startMs,
        endMs: c.endMs,
      })),
    }));

    const result = await composeProject(
      jobId,
      exportable,
      {
        transitionsEnabled: project.transitionsEnabled,
        backgroundMusicPublicPath: project.backgroundMusicPath,
        aspect: resolveAspect(project.aspectRatio),
      },
      progress,
    );

    await prisma.project.update({
      where: { id: job.projectId },
      data: { status: "done" },
    });

    return { outputPath: result.outputPublicPath };
  });
}
