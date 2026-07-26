import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reapStaleJobs } from "@/lib/jobs/runner";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const existing = await prisma.job.findUnique({ where: { id: jobId } });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Polling this job is also the moment to notice it was orphaned by a restart,
  // so the UI shows a real failure instead of a progress bar frozen forever.
  await reapStaleJobs(existing.projectId);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  return NextResponse.json(job);
}

// Manual escape hatch: lets the user abandon a job that is wedged (or that they
// simply no longer want) without waiting for the staleness window or touching
// the database by hand.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (job.status === "done") {
    return NextResponse.json({ error: "任务已完成，无法取消" }, { status: 400 });
  }
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status: "canceled", stage: null, errorMessage: "已手动取消" },
  });
  return NextResponse.json(updated);
}
