import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProjectEditor } from "@/components/ProjectEditor";
import type { ProjectDTO } from "@/lib/types";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      shots: {
        orderBy: { order: "asc" },
        include: { audio: true },
      },
    },
  });
  if (!project) notFound();

  // Serialize explicitly: Prisma hands back Date objects, and the DTO the client
  // components are typed against expects the ISO strings that JSON would produce.
  const dto: ProjectDTO = {
    id: project.id,
    title: project.title,
    script: project.script,
    status: project.status,
    transitionsEnabled: project.transitionsEnabled,
    backgroundMusicPath: project.backgroundMusicPath,
    aspectRatio: project.aspectRatio,
    voice: project.voice,
    shots: project.shots.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      order: s.order,
      text: s.text,
      description: s.description,
      keywordsZh: s.keywordsZh,
      keywordsEn: s.keywordsEn,
      materialProvider: s.materialProvider,
      materialType: s.materialType,
      materialUrl: s.materialUrl,
      materialThumbUrl: s.materialThumbUrl,
      durationMs: s.durationMs,
      audio: s.audio
        ? { id: s.audio.id, filePath: s.audio.filePath, durationMs: s.audio.durationMs }
        : null,
    })),
  };

  return <ProjectEditor project={dto} />;
}
