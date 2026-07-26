import { NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, maskSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(maskSettings(settings));
}

const patchSchema = z.object({
  llmBaseUrl: z.string().trim().optional(),
  llmApiKey: z.string().trim().optional(),
  llmModel: z.string().trim().optional(),
  pexelsApiKey: z.string().trim().optional(),
  pixabayApiKey: z.string().trim().optional(),
});

export async function PATCH(request: Request) {
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Empty string means "leave this field unchanged" (the browser never
  // holds the real secret value to submit back), so drop empty entries.
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== ""),
  );

  const updated = await updateSettings(patch);
  return NextResponse.json(maskSettings(updated));
}
