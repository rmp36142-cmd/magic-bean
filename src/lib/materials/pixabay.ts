import type { MaterialItem, MaterialType } from "@/lib/materials/types";
import { fetchWithTimeout } from "@/lib/http";

type PixabayVideoRendition = { url: string; width: number; height: number };

type PixabayVideoHit = {
  id: number;
  duration: number; // seconds
  videos: {
    large: PixabayVideoRendition;
    medium: PixabayVideoRendition;
    small: PixabayVideoRendition;
    tiny: PixabayVideoRendition;
  };
  user: string;
};

type PixabayPhotoHit = {
  id: number;
  webformatURL: string;
  largeImageURL: string;
  previewURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
};

const MIN_PER_PAGE = 3;

export async function searchPixabay(
  apiKey: string,
  keyword: string,
  type: MaterialType,
  perPage = 8,
): Promise<MaterialItem[]> {
  if (!apiKey) return [];
  const safePerPage = Math.max(perPage, MIN_PER_PAGE);

  const endpoint =
    type === "video"
      ? `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(keyword)}&per_page=${safePerPage}`
      : `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(keyword)}&image_type=photo&per_page=${safePerPage}`;

  const res = await fetchWithTimeout(endpoint);
  if (!res.ok) {
    throw new Error(`Pixabay 请求失败 (${res.status})`);
  }
  const data = await res.json();

  if (type === "video") {
    const hits: PixabayVideoHit[] = data.hits ?? [];
    return hits.map((h) => {
      const rendition = h.videos.medium?.url ? h.videos.medium : h.videos.small;
      const item: MaterialItem = {
        provider: "pixabay",
        sourceId: String(h.id),
        type: "video",
        previewUrl: h.videos.tiny?.url ?? rendition.url,
        downloadUrl: rendition.url,
        width: rendition.width,
        height: rendition.height,
        durationMs: Math.round(h.duration * 1000),
        attribution: `Video by ${h.user} on Pixabay`,
      };
      return item;
    });
  }

  const hits: PixabayPhotoHit[] = data.hits ?? [];
  return hits.map((h) => ({
    provider: "pixabay",
    sourceId: String(h.id),
    type: "photo",
    previewUrl: h.previewURL,
    downloadUrl: h.largeImageURL || h.webformatURL,
    width: h.imageWidth,
    height: h.imageHeight,
    attribution: `Image by ${h.user} on Pixabay`,
  }));
}
