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
      _count: { select: { shots: true } },
    },
  });
  return NextResponse.json(projects);
}

const createSchema = z.object({
  script: z.string().trim().min(1, "文案不能为空"),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const title = parsed.data.script.slice(0, 24) || "未命名项目";
  const project = await prisma.project.create({
    data: { title, script: parsed.data.script },
  });
  return NextResponse.json(project, { status: 201 });
}
