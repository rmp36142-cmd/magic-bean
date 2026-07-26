import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { shots: { orderBy: { order: "asc" } } },
  });
  if (!project) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-xl font-semibold">{project.title}</h1>
      <p className="mt-1 text-xs text-neutral-400">状态：{project.status}</p>

      <div className="mt-6 rounded-lg border border-neutral-200 p-4 text-sm whitespace-pre-wrap dark:border-neutral-800">
        {project.script}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-neutral-500">
          分镜（{project.shots.length}）
        </h2>
        {project.shots.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            还没有拆分镜头 —— 这是下一阶段（接入 LLM 自动拆分镜头）要做的功能。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {project.shots.map((shot) => (
              <li
                key={shot.id}
                className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                {shot.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
