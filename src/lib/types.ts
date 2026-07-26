// Plain client-safe mirrors of the Prisma models (avoids importing the
// generated Prisma client, which is server-only, into client components).
//
// Note: DateTime columns arrive as ISO strings once they've been through
// JSON.stringify in a route handler, which is how the client always receives
// them — hence `string` here rather than `Date`.

export type AudioSegmentDTO = {
  id: string;
  filePath: string;
  durationMs: number;
};

export type ShotDTO = {
  id: string;
  projectId: string;
  order: number;
  text: string;
  description: string | null;
  keywordsZh: string | null;
  keywordsEn: string | null;
  materialProvider: string | null;
  materialType: string | null;
  materialUrl: string | null;
  materialThumbUrl: string | null;
  durationMs: number | null;
  audio: AudioSegmentDTO | null;
};

export type ProjectDTO = {
  id: string;
  title: string;
  script: string;
  status: string;
  shots: ShotDTO[];
  transitionsEnabled: boolean;
  backgroundMusicPath: string | null;
  aspectRatio: string;
  voice: string;
};

export type MaterialCandidateDTO = {
  id: string;
  shotId: string;
  provider: string;
  sourceId: string;
  type: string;
  previewUrl: string;
  downloadUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  attribution: string | null;
};

export type FavoriteMaterialDTO = {
  id: string;
  provider: string;
  sourceId: string;
  type: string;
  previewUrl: string;
  downloadUrl: string;
  attribution: string | null;
};

export type UserMaterialDTO = {
  id: string;
  type: string;
  filePath: string;
  thumbPath: string | null;
  originalName: string;
  durationMs: number | null;
};

export type JobKind = "audio" | "export";
export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

export type JobDTO = {
  id: string;
  projectId: string;
  kind: JobKind;
  status: JobStatus;
  progress: number;
  stage: string | null;
  outputPath: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type VoiceOptionDTO = {
  shortName: string;
  label: string;
  locale: string;
  gender: string;
};

export function isJobActive(job: JobDTO | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}
