"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ASPECT_LIST } from "@/lib/aspect";

const MAX_SCRIPT_CHARS = 10_000;

type ProjectListItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  aspectRatio: string;
  _count: { shots: number };
};

export default function Home() {
  const router = useRouter();
  const [script, setScript] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjects)
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!script.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, aspectRatio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      router.push(`/projects/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setCreating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string, title: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`删除项目「${title}」？此操作不可撤销。`)) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((list) => list.filter((p) => p.id !== id));
  }

  const overLimit = script.length > MAX_SCRIPT_CHARS;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-center text-3xl font-semibold">让文字穿越到影像的世界</h1>
      <p className="mt-2 text-center text-sm text-neutral-500">
        个人版 · 素材来自 Pexels / Pixabay 公开免费库
      </p>

      <div className="mt-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="输入/粘贴视频文稿，即刻为你生成分镜"
          rows={6}
          className="w-full resize-none bg-transparent text-sm outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">画面比例</span>
          {ASPECT_LIST.map((a) => (
            <button
              key={a.ratio}
              onClick={() => setAspectRatio(a.ratio)}
              className={`rounded border px-2 py-1 text-xs ${
                aspectRatio === a.ratio
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {a.ratio}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs ${overLimit ? "text-red-600" : "text-neutral-400"}`}>
            {script.length} / {MAX_SCRIPT_CHARS}
          </span>
          <button
            onClick={handleCreate}
            disabled={!script.trim() || creating || overLimit}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {creating ? "创建中…" : "创建"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="mt-12">
        <h2 className="text-sm font-medium text-neutral-500">我的项目</h2>
        {projects.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">还没有项目</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:opacity-70">
                  {p.title}
                </Link>
                <span className="flex shrink-0 items-center gap-3 text-neutral-400">
                  <span>
                    {p.aspectRatio} · {p._count.shots} 个分镜
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, p.id, p.title)}
                    className="hover:text-red-600 hover:underline"
                  >
                    删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
