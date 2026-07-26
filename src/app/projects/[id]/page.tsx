import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProjectEditor } from "@/components/ProjectEditor";

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

  return <ProjectEditor project={project} />;
}
