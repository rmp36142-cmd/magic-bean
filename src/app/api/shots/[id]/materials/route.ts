import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { searchMaterials } from "@/lib/materials/search";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const keyword =
    url.searchParams.get("keyword") ??
    shot.keywordsEn?.split(",")[0] ??
    shot.keywordsZh?.split(",")[0];
  if (!keyword) {
    return NextResponse.json({ error: "缺少搜索关键词" }, { status: 400 });
  }

  const settings = await getSettings();
  if (!settings.pexelsApiKey && !settings.pixabayApiKey) {
    return NextResponse.json(
      { error: "尚未配置任何素材源 API Key，请先在设置页填写" },
      { status: 400 },
    );
  }

  let items;
  try {
    items = await searchMaterials(settings, keyword, "video");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "素材搜索失败" },
      { status: 502 },
    );
  }

  // The candidate table is a cache of *the latest search* for this shot, so
  // replace it wholesale. Previously every search upserted more rows and none
  // were ever removed, so candidates grew without bound as the user retried
  // different keywords.
  const candidates = await prisma.$transaction(async (tx) => {
    await tx.materialCandidate.deleteMany({ where: { shotId: shot.id } });
    if (items.length === 0) return [];
    await tx.materialCandidate.createMany({
      data: items.map((item) => ({
        shotId: shot.id,
        provider: item.provider,
        sourceId: item.sourceId,
        type: item.type,
        previewUrl: item.previewUrl,
        downloadUrl: item.downloadUrl,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        attribution: item.attribution,
      })),
    });
    return tx.materialCandidate.findMany({ where: { shotId: shot.id } });
  });

  return NextResponse.json(candidates);
}
