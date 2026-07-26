import { prisma } from "@/lib/db";
import { composeProject, type ExportableShot } from "@/lib/ffmpeg/pipeline";

export async function runExportJob(jobId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const project = await prisma.project.findUnique({ where: { id: job.projectId } });
    if (!project) throw new Error("项目不存在");

    const shots = await prisma.shot.findMany({
      where: { projectId: job.projectId },
      orderBy: { order: "asc" },
      include: { audio: true },
    });

    const exportable: ExportableShot[] = shots.map((s) => ({
      id: s.id,
      text: s.text,
      materialType: s.materialType ?? "",
      materialUrl: s.materialUrl ?? "",
      durationMs: s.durationMs ?? 0,
      audioPublicPath: s.audio?.filePath ?? "",
    }));

    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: "running", progress: 1, stage: "准备中" },
    });

    const result = await composeProject(
      jobId,
      exportable,
      {
        transitionsEnabled: project.transitionsEnabled,
        backgroundMusicPublicPath: project.backgroundMusicPath,
      },
      async (stage, progress) => {
        await prisma.exportJob.update({ where: { id: jobId }, data: { stage, progress } });
      },
    );

    await prisma.$transaction([
      prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: "done",
          progress: 100,
          stage: "完成",
          outputPath: result.outputPublicPath,
        },
      }),
      prisma.project.update({ where: { id: job.projectId }, data: { status: "done" } }),
    ]);
  } catch (err) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "导出失败",
      },
    });
  }
}
