import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET() {
  const favorites = await prisma.favoriteMaterial.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(favorites);
}

const createSchema = z.object({
  provider: z.string().min(1),
  sourceId: z.string().min(1),
  type: z.enum(["video", "photo"]),
  previewUrl: z.string().url(),
  downloadUrl: z.string().url(),
  attribution: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { provider, sourceId } = parsed.data;
  const favorite = await prisma.favoriteMaterial.upsert({
    where: { provider_sourceId: { provider, sourceId } },
    create: parsed.data,
    update: { previewUrl: parsed.data.previewUrl, downloadUrl: parsed.data.downloadUrl },
  });
  return NextResponse.json(favorite, { status: 201 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const provider = url.searchParams.get("provider");
  const sourceId = url.searchParams.get("sourceId");

  if (id) {
    await prisma.favoriteMaterial.delete({ where: { id } }).catch(() => null);
  } else if (provider && sourceId) {
    await prisma.favoriteMaterial
      .delete({ where: { provider_sourceId: { provider, sourceId } } })
      .catch(() => null);
  } else {
    return NextResponse.json({ error: "缺少 id 或 provider+sourceId" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
