import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runExportJob } from "@/lib/ffmpeg/exportJob";
import { createJob, findActiveJob } from "@/lib/jobs/runner";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // findActiveJob reaps stale jobs first, so a job orphaned by a restart can no
  // longer block this forever.
  const active = await findActiveJob(id, "export");
  if (active) {
    return NextResponse.json(
      { error: "已经有一个导出任务在进行中", job: active },
      { status: 409 },
    );
  }

  const job = await createJob(id, "export");

  // Deliberately not awaited: this process must stay alive for the whole
  // export, which is fine on the persistent Node server ffmpeg already
  // requires (see README) — the client polls GET /api/jobs/[jobId].
  void runExportJob(job.id);

  return NextResponse.json(job, { status: 202 });
}
