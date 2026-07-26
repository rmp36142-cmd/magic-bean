import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reapStaleJobs } from "@/lib/jobs/runner";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await reapStaleJobs(id);

  const kind = new URL(request.url).searchParams.get("kind");
  const jobs = await prisma.job.findMany({
    where: { projectId: id, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json(jobs);
}
