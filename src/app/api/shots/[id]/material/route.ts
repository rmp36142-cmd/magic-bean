import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const bodySchema = z.object({ candidateId: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const candidate = await prisma.materialCandidate.findUnique({
    where: { id: parsed.data.candidateId },
  });
  if (!candidate || candidate.shotId !== id) {
    return NextResponse.json({ error: "候选素材不存在" }, { status: 404 });
  }

  // Note: durationMs on Shot is the *timeline* duration (driven by the
  // narration audio, see /api/shots/[id]/audio), not the stock clip's own
  // native length — the export pipeline loops/trims material to fit it.
  const shot = await prisma.shot.update({
    where: { id },
    data: {
      materialProvider: candidate.provider,
      materialType: candidate.type,
      materialUrl: candidate.downloadUrl,
      materialThumbUrl: candidate.previewUrl,
    },
  });

  return NextResponse.json(shot);
}
