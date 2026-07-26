import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { diskPath, ensureDir, publicUrl } from "@/lib/storage";

const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg", ".aac"];
const MAX_MUSIC_BYTES = 30 * 1024 * 1024;

// Removes whatever music file this project currently has, whatever its
// extension — needed both on delete and before writing a replacement in a
// different format, which would otherwise silently orphan the old file.
async function removeExistingMusic(projectId: string, storedPath: string | null) {
  if (storedPath) {
    await fs
      .rm(diskPath("music", `${projectId}${path.extname(storedPath)}`), { force: true })
      .catch(() => {});
    return;
  }
  await Promise.all(
    ALLOWED_EXTENSIONS.map((ext) =>
      fs.rm(diskPath("music", `${projectId}${ext}`), { force: true }).catch(() => {}),
    ),
  );
}

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

  // Check the declared size before reading the body into memory.
  if (file.size > MAX_MUSIC_BYTES) {
    return NextResponse.json(
      { error: `音频文件过大（上限 ${MAX_MUSIC_BYTES / 1024 / 1024}MB）` },
      { status: 413 },
    );
  }

  const ext = path.extname(file.name).toLowerCase() || ".mp3";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `不支持的音频格式，支持：${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_MUSIC_BYTES) {
    return NextResponse.json({ error: "音频文件过大" }, { status: 413 });
  }

  await removeExistingMusic(id, project.backgroundMusicPath);

  const dir = diskPath("music");
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `${id}${ext}`), buffer);

  const updated = await prisma.project.update({
    where: { id },
    data: { backgroundMusicPath: publicUrl("music", `${id}${ext}`) },
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
  await removeExistingMusic(id, project.backgroundMusicPath);
  const updated = await prisma.project.update({
    where: { id },
    data: { backgroundMusicPath: null },
  });
  return NextResponse.json(updated);
}
