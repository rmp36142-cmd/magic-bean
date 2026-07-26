import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { diskPath, ensureDir, publicUrl } from "@/lib/storage";

const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg", ".aac"];

// Pexels/Pixabay's public APIs don't cover music, so background music is
// simply a file the user brings themselves (their own free-license track,
// something from Pixabay's website, etc.) rather than another API search.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少音频文件" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase() || ".mp3";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `不支持的音频格式，支持：${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const dir = diskPath("music");
  await ensureDir(dir);
  const diskFilePath = path.join(dir, `${id}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(diskFilePath, buffer);

  const publicPath = publicUrl("music", `${id}${ext}`);
  const updated = await prisma.project.update({
    where: { id },
    data: { backgroundMusicPath: publicPath },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (project.backgroundMusicPath) {
    const ext = path.extname(project.backgroundMusicPath);
    await fs.rm(diskPath("music", `${id}${ext}`), { force: true }).catch(() => {});
  }
  const updated = await prisma.project.update({
    where: { id },
    data: { backgroundMusicPath: null },
  });
  return NextResponse.json(updated);
}
