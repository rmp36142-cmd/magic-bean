export type MaterialType = "video" | "photo";
export type MaterialProvider = "pexels" | "pixabay";

export type MaterialItem = {
  provider: MaterialProvider;
  sourceId: string;
  type: MaterialType;
  previewUrl: string;
  downloadUrl: string;
  width?: number;
  height?: number;
  durationMs?: number;
  attribution?: string;
};
