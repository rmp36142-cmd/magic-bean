import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runExportJob } from "@/lib/ffmpeg/exportJob";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const active = await prisma.exportJob.findFirst({
    where: { projectId: id, status: { in: ["queued", "running"] } },
  });
  if (active) {
    return NextResponse.json(
      { error: "已经有一个导出任务在进行中", job: active },
      { status: 409 },
    );
  }

  const job = await prisma.exportJob.create({
    data: { projectId: id, status: "queued", progress: 0 },
  });

  await prisma.project.update({ where: { id }, data: { status: "exporting" } });

  // Deliberately not awaited: this process must stay alive for the whole
  // export, which is fine on the persistent Node server ffmpeg already
  // requires (see README) — the client polls GET /api/export/[jobId].
  void runExportJob(job.id);

  return NextResponse.json(job, { status: 202 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const jobs = await prisma.exportJob.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(jobs);
}
