import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { diskPath, ensureDir, publicUrl, publicUrlToDiskPath } from "@/lib/storage";
import { probeDurationMs } from "@/lib/ffmpeg/exec";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".m4v"];
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function GET() {
  const uploads = await prisma.userMaterial.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(uploads);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `文件过大（上限 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB）` },
      { status: 413 },
    );
  }

  // Only the extension is taken from the client's filename, and the stored name
  // is a random id — the original name never touches the filesystem path.
  const ext = path.extname(file.name).toLowerCase();
  const isVideo = VIDEO_EXTENSIONS.includes(ext);
  const isPhoto = PHOTO_EXTENSIONS.includes(ext);
  if (!isVideo && !isPhoto) {
    return NextResponse.json(
      {
        error: `不支持的格式，视频支持 ${VIDEO_EXTENSIONS.join("/")}，图片支持 ${PHOTO_EXTENSIONS.join("/")}`,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "文件过大" }, { status: 413 });
  }

  const dir = diskPath("uploads");
  await ensureDir(dir);
  const storedName = `${crypto.randomBytes(10).toString("hex")}${ext}`;
  const diskFilePath = path.join(dir, storedName);
  await fs.writeFile(diskFilePath, buffer);

  let durationMs: number | null = null;
  if (isVideo) {
    durationMs = await probeDurationMs(diskFilePath).catch(() => null);
  }

  const material = await prisma.userMaterial.create({
    data: {
      type: isVideo ? "video" : "photo",
      filePath: publicUrl("uploads", storedName),
      // Videos have no cheap thumbnail; the picker falls back to a <video>
      // preview element for those.
      thumbPath: isPhoto ? publicUrl("uploads", storedName) : null,
      originalName: file.name.slice(0, 200),
      durationMs,
    },
  });

  return NextResponse.json(material, { status: 201 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const material = await prisma.userMaterial.findUnique({ where: { id } });
  if (!material) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Shots already using this upload would break on export; clear them so the
  // failure is visible in the editor instead of only at export time.
  await prisma.shot.updateMany({
    where: { materialUrl: material.filePath },
    data: {
      materialUrl: null,
      materialThumbUrl: null,
      materialProvider: null,
      materialType: null,
    },
  });

  await prisma.userMaterial.delete({ where: { id } });
  await fs.rm(publicUrlToDiskPath(material.filePath), { force: true }).catch(() => {});

  return NextResponse.json({ ok: true });
}
