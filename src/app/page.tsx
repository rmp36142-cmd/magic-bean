"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ProjectListItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  _count: { shots: number };
};

export default function Home() {
  const router = useRouter();
  const [script, setScript] = useState("");
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
  }, []);

  async function handleCreate() {
    if (!script.trim() || creating) return;
    setCreating(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script }),
    });
    setCreating(false);
    if (!res.ok) return;
    const project = await res.json();
    router.push(`/projects/${project.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-center text-3xl font-semibold">
        让文字穿越到影像的世界
      </h1>
      <p className="mt-2 text-center text-sm text-neutral-500">
        个人版 · 素材来自 Pexels / Pixabay 公开免费库
      </p>

      <div className="mt-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="输入/粘贴视频文稿，即刻为你生成分镜"
          rows={6}
          maxLength={10000}
          className="w-full resize-none bg-transparent text-sm outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            {script.length} / 10000
          </span>
          <button
            onClick={handleCreate}
            disabled={!script.trim() || creating}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {creating ? "创建中…" : "创建"}
          </button>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-sm font-medium text-neutral-500">我的项目</h2>
        {projects.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">还没有项目</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between py-3 text-sm hover:opacity-70"
                >
                  <span>{p.title}</span>
                  <span className="text-neutral-400">
                    {p._count.shots} 个分镜 · {p.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
