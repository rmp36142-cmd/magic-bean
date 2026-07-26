import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAudioJob } from "@/lib/tts/audioJob";
import { createJob, findActiveJob } from "@/lib/jobs/runner";

const bodySchema = z.object({ force: z.boolean().optional() }).optional();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const raw = await request.json().catch(() => undefined);
  const parsed = bodySchema.safeParse(raw);
  const force = parsed.success ? (parsed.data?.force ?? false) : false;

  const active = await findActiveJob(id, "audio");
  if (active) {
    return NextResponse.json(
      { error: "已经有一个配音任务在进行中", job: active },
      { status: 409 },
    );
  }

  const shotCount = await prisma.shot.count({ where: { projectId: id } });
  if (shotCount === 0) {
    return NextResponse.json({ error: "还没有分镜" }, { status: 400 });
  }

  const job = await createJob(id, "audio");
  void runAudioJob(job.id, { force });

  return NextResponse.json(job, { status: 202 });
}
