import type { AppSettings } from "@/lib/settings";
import type { MaterialItem, MaterialType } from "@/lib/materials/types";
import { searchPexels } from "@/lib/materials/pexels";
import { searchPixabay } from "@/lib/materials/pixabay";

// Queries every provider the user has configured a key for, in parallel,
// and interleaves the results so one provider's ordering doesn't dominate.
// Falls back from video to photo material if no video results come back at
// all (common for more abstract/conceptual keywords).
export async function searchMaterials(
  settings: Pick<AppSettings, "pexelsApiKey" | "pixabayApiKey">,
  keywordEn: string,
  type: MaterialType = "video",
): Promise<MaterialItem[]> {
  const results = await runProviders(settings, keywordEn, type);
  if (results.length > 0 || type === "photo") return results;
  return runProviders(settings, keywordEn, "photo");
}

async function runProviders(
  settings: Pick<AppSettings, "pexelsApiKey" | "pixabayApiKey">,
  keyword: string,
  type: MaterialType,
): Promise<MaterialItem[]> {
  const jobs: Promise<MaterialItem[]>[] = [];
  if (settings.pexelsApiKey) {
    jobs.push(
      searchPexels(settings.pexelsApiKey, keyword, type).catch(() => []),
    );
  }
  if (settings.pixabayApiKey) {
    jobs.push(
      searchPixabay(settings.pixabayApiKey, keyword, type).catch(() => []),
    );
  }
  if (jobs.length === 0) return [];

  const perProvider = await Promise.all(jobs);
  return interleave(perProvider);
}

function interleave(lists: MaterialItem[][]): MaterialItem[] {
  const out: MaterialItem[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (list[i]) out.push(list[i]);
    }
  }
  return out;
}
