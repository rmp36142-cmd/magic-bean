import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      aspectRatio: true,
      _count: { select: { shots: true } },
    },
  });
  return NextResponse.json(projects);
}

// Mirrors the textarea's maxLength, but enforced here too: the UI limit is
// trivially bypassed, and an oversized script means a huge LLM bill and a
// split request that may never come back.
export const MAX_SCRIPT_CHARS = 10_000;

const createSchema = z.object({
  script: z
    .string()
    .trim()
    .min(1, "文案不能为空")
    .max(MAX_SCRIPT_CHARS, `文案不能超过 ${MAX_SCRIPT_CHARS} 字`),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 },
    );
  }

  const title = parsed.data.script.slice(0, 24) || "未命名项目";
  const project = await prisma.project.create({
    data: {
      title,
      script: parsed.data.script,
      ...(parsed.data.aspectRatio ? { aspectRatio: parsed.data.aspectRatio } : {}),
    },
  });
  return NextResponse.json(project, { status: 201 });
}
