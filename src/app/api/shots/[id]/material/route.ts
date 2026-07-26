import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

// A shot's material can come from three places: the current stock search
// results (candidateId), the starred library (favoriteId), or the user's own
// uploads (uploadId). All three collapse onto the same fields on Shot.
const bodySchema = z.union([
  z.object({ candidateId: z.string().min(1) }),
  z.object({ favoriteId: z.string().min(1) }),
  z.object({ uploadId: z.string().min(1) }),
]);

type Chosen = {
  provider: string;
  type: string;
  downloadUrl: string;
  previewUrl: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "需要 candidateId / favoriteId / uploadId 之一" }, { status: 400 });
  }

  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let chosen: Chosen | null = null;

  if ("candidateId" in parsed.data) {
    const candidate = await prisma.materialCandidate.findUnique({
      where: { id: parsed.data.candidateId },
    });
    if (candidate && candidate.shotId === id) {
      chosen = {
        provider: candidate.provider,
        type: candidate.type,
        downloadUrl: candidate.downloadUrl,
        previewUrl: candidate.previewUrl,
      };
    }
  } else if ("favoriteId" in parsed.data) {
    const favorite = await prisma.favoriteMaterial.findUnique({
      where: { id: parsed.data.favoriteId },
    });
    if (favorite) {
      chosen = {
        provider: favorite.provider,
        type: favorite.type,
        downloadUrl: favorite.downloadUrl,
        previewUrl: favorite.previewUrl,
      };
    }
  } else {
    const upload = await prisma.userMaterial.findUnique({
      where: { id: parsed.data.uploadId },
    });
    if (upload) {
      chosen = {
        provider: "upload",
        type: upload.type,
        downloadUrl: upload.filePath,
        previewUrl: upload.thumbPath ?? upload.filePath,
      };
    }
  }

  if (!chosen) {
    return NextResponse.json({ error: "素材不存在" }, { status: 404 });
  }

  // Note: durationMs on Shot is the *timeline* duration (driven by the
  // narration audio, see /api/shots/[id]/audio), not the stock clip's own
  // native length — the export pipeline loops/trims material to fit it.
  const updated = await prisma.shot.update({
    where: { id },
    data: {
      materialProvider: chosen.provider,
      materialType: chosen.type,
      materialUrl: chosen.downloadUrl,
      materialThumbUrl: chosen.previewUrl,
    },
    include: { audio: true },
  });

  return NextResponse.json(updated);
}
