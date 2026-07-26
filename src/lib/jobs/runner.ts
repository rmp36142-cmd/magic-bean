import { prisma } from "@/lib/db";

export type JobKind = "audio" | "export";

// A job whose heartbeat is older than this is assumed to belong to a process
// that no longer exists (crash, restart, deploy). Generous enough that a slow
// ffmpeg encode never trips it, because runCommand refreshes the heartbeat
// from the child's own output.
const STALE_AFTER_MS = 3 * 60_000;

export type ProgressReporter = {
  report: (stage: string, progress: number) => Promise<void>;
  // Refresh only the heartbeat, without moving the progress bar. Passed into
  // ffmpeg so a long single command still proves liveness.
  beat: () => void;
};

// Marks jobs abandoned by a dead process as failed. Called before anything
// that asks "is a job already active for this project?", so a crash can never
// permanently wedge the project — which it previously did: the export guard
// saw a forever-"running" row and returned 409 to every future attempt.
export async function reapStaleJobs(projectId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const { count } = await prisma.job.updateMany({
    where: {
      ...(projectId ? { projectId } : {}),
      status: { in: ["queued", "running"] },
      heartbeatAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      errorMessage: "任务中断（服务重启或进程退出），已自动标记为失败，可以重新开始",
    },
  });
  return count;
}

export async function findActiveJob(projectId: string, kind: JobKind) {
  await reapStaleJobs(projectId);
  return prisma.job.findFirst({
    where: { projectId, kind, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createJob(projectId: string, kind: JobKind) {
  return prisma.job.create({
    data: { projectId, kind, status: "queued", progress: 0, heartbeatAt: new Date() },
  });
}

export class JobCanceledError extends Error {
  constructor() {
    super("任务已取消");
  }
}

function makeReporter(jobId: string): ProgressReporter {
  let beatInFlight = false;
  return {
    report: async (stage: string, progress: number) => {
      // Every progress checkpoint doubles as a cancellation checkpoint, so a
      // canceled job actually stops rather than running to completion in the
      // background. Granularity is one stage / one shot / one ffmpeg command.
      const current = await prisma.job.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (current?.status === "canceled") throw new JobCanceledError();

      await prisma.job.update({
        where: { id: jobId },
        data: { stage, progress, heartbeatAt: new Date() },
      });
    },
    beat: () => {
      // fire-and-forget, and never pile up: this is called from ffmpeg output
      if (beatInFlight) return;
      beatInFlight = true;
      prisma.job
        .update({ where: { id: jobId }, data: { heartbeatAt: new Date() } })
        .catch(() => {})
        .finally(() => {
          beatInFlight = false;
        });
    },
  };
}

// Wraps a unit of background work with the status/heartbeat/error bookkeeping
// every job needs, so individual jobs only implement their actual work.
export async function runJob(
  jobId: string,
  work: (progress: ProgressReporter) => Promise<{ outputPath?: string } | void>,
): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  const progress = makeReporter(jobId);

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "running", progress: 1, stage: "准备中", heartbeatAt: new Date() },
    });

    const result = await work(progress);

    // A cancel that landed after the last checkpoint must not be clobbered by
    // a "done" write.
    if (await wasCanceled(jobId)) return;

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "done",
        progress: 100,
        stage: "完成",
        outputPath: result?.outputPath ?? null,
        heartbeatAt: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof JobCanceledError || (await wasCanceled(jobId))) return;
    await prisma.job
      .update({
        where: { id: jobId },
        data: {
          status: "failed",
          stage: null,
          errorMessage: err instanceof Error ? err.message : "任务失败",
          heartbeatAt: new Date(),
        },
      })
      .catch(() => {});
  }
}

async function wasCanceled(jobId: string): Promise<boolean> {
  const row = await prisma.job
    .findUnique({ where: { id: jobId }, select: { status: true } })
    .catch(() => null);
  return row?.status === "canceled";
}
