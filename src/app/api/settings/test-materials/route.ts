import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { searchPexels } from "@/lib/materials/pexels";
import { searchPixabay } from "@/lib/materials/pixabay";

export async function POST() {
  const settings = await getSettings();
  const results: Record<string, { ok: boolean; error?: string; count?: number }> = {};

  if (settings.pexelsApiKey) {
    try {
      const items = await searchPexels(settings.pexelsApiKey, "nature", "video", 1);
      results.pexels = { ok: true, count: items.length };
    } catch (err) {
      results.pexels = { ok: false, error: err instanceof Error ? err.message : "连接失败" };
    }
  } else {
    results.pexels = { ok: false, error: "未配置 Key" };
  }

  if (settings.pixabayApiKey) {
    try {
      const items = await searchPixabay(settings.pixabayApiKey, "nature", "video", 3);
      results.pixabay = { ok: true, count: items.length };
    } catch (err) {
      results.pixabay = { ok: false, error: err instanceof Error ? err.message : "连接失败" };
    }
  } else {
    results.pixabay = { ok: false, error: "未配置 Key" };
  }

  return NextResponse.json(results);
}
