import type { MaterialItem, MaterialType } from "@/lib/materials/types";

type PexelsVideoFile = {
  link: string;
  quality: string;
  width: number;
  height: number;
  file_type: string;
};

type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  duration: number; // seconds
  image: string;
  video_files: PexelsVideoFile[];
  user: { name: string; url: string };
};

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  src: {
    large: string;
    medium: string;
    tiny: string;
  };
  photographer: string;
  photographer_url: string;
};

// Prefer a moderate-resolution mp4 (~720p) over the largest available file,
// to keep download/compositing fast for a personal project.
function pickVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const mp4s = files.filter((f) => f.file_type === "video/mp4");
  if (mp4s.length === 0) return files[0];
  const sorted = [...mp4s].sort((a, b) => a.width - b.width);
  return sorted.find((f) => f.width >= 960) ?? sorted[sorted.length - 1];
}

export async function searchPexels(
  apiKey: string,
  keyword: string,
  type: MaterialType,
  perPage = 8,
): Promise<MaterialItem[]> {
  if (!apiKey) return [];

  const endpoint =
    type === "video"
      ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=${perPage}`
      : `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=${perPage}`;

  const res = await fetch(endpoint, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    throw new Error(`Pexels 请求失败 (${res.status})`);
  }
  const data = await res.json();

  if (type === "video") {
    const videos: PexelsVideo[] = data.videos ?? [];
    return videos
      .map((v) => {
        const file = pickVideoFile(v.video_files);
        if (!file) return null;
        const item: MaterialItem = {
          provider: "pexels",
          sourceId: String(v.id),
          type: "video",
          previewUrl: v.image,
          downloadUrl: file.link,
          width: file.width,
          height: file.height,
          durationMs: Math.round(v.duration * 1000),
          attribution: `Video by ${v.user.name} on Pexels`,
        };
        return item;
      })
      .filter((x): x is MaterialItem => x !== null);
  }

  const photos: PexelsPhoto[] = data.photos ?? [];
  return photos.map((p) => ({
    provider: "pexels",
    sourceId: String(p.id),
    type: "photo",
    previewUrl: p.src.tiny,
    downloadUrl: p.src.large,
    width: p.width,
    height: p.height,
    attribution: `Photo by ${p.photographer} on Pexels`,
  }));
}
