import { prisma } from "@/lib/db";
import { runJob } from "@/lib/jobs/runner";
import { synthesizeShotAudio, DEFAULT_VOICE } from "@/lib/tts/edgeTts";
import { regenerateShotCues } from "@/lib/shots/cues";

// Bulk narration used to run inline in the HTTP request: 40 shots x a few
// seconds of TTS each is minutes long with no progress and a real chance of a
// proxy timeout. Now it's a background job like export, polled by the client.
export async function runAudioJob(jobId: string, options: { force: boolean }): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  await runJob(jobId, async (progress) => {
    const project = await prisma.project.findUnique({ where: { id: job.projectId } });
    if (!project) throw new Error("项目不存在");

    const shots = await prisma.shot.findMany({
      where: { projectId: job.projectId },
      include: { audio: true },
      orderBy: { order: "asc" },
    });
    if (shots.length === 0) throw new Error("还没有分镜");

    const pending = options.force ? shots : shots.filter((s) => !s.audio);
    if (pending.length === 0) {
      await progress.report("所有分镜都已有配音", 100);
      return;
    }

    const voice = project.voice || DEFAULT_VOICE;
    const failures: string[] = [];

    for (let i = 0; i < pending.length; i++) {
      const shot = pending[i];
      await progress.report(
        `生成配音 (${i + 1}/${pending.length})`,
        Math.round(((i + 0.5) / pending.length) * 98) + 1,
      );
      try {
        const audio = await synthesizeShotAudio(shot.id, shot.text, voice);
        await prisma.$transaction([
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
          prisma.shot.update({
            where: { id: shot.id },
            data: { durationMs: audio.durationMs },
          }),
        ]);
        await regenerateShotCues(shot.id, shot.text, audio.durationMs, project.aspectRatio);
      } catch (err) {
        failures.push(
          `「${shot.text.slice(0, 10)}…」${err instanceof Error ? err.message : "生成失败"}`,
        );
      }
    }

    if (failures.length === pending.length) {
      throw new Error(`全部配音生成失败：${failures[0]}`);
    }
    if (failures.length > 0) {
      // Partial success is still a usable project; surface which ones failed
      // without failing the whole job.
      await progress.report(`完成，但 ${failures.length} 个分镜失败：${failures.join("; ")}`, 99);
    }
  });
}
