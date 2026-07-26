// Plain client-safe mirrors of the Prisma models (avoids importing the
// generated Prisma client, which is server-only, into client components).

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

export type ExportJobDTO = {
  id: string;
  projectId: string;
  status: string;
  progress: number;
  stage: string | null;
  outputPath: string | null;
  errorMessage: string | null;
};
