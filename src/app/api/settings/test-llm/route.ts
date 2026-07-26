import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { chatComplete } from "@/lib/llm/client";

export async function POST() {
  const settings = await getSettings();
  try {
    const reply = await chatComplete({
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      messages: [{ role: "user", content: "只回复两个字：正常" }],
    });
    return NextResponse.json({ ok: true, reply: reply.slice(0, 200) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "连接失败" },
      { status: 200 },
    );
  }
}
