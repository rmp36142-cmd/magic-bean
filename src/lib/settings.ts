import { prisma } from "@/lib/db";

export type AppSettings = {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  pexelsApiKey: string;
  pixabayApiKey: string;
  ttsProvider: string;
};

const SETTINGS_ID = 1;

// .env.local values seed the settings row the first time it's read; after
// that, whatever is saved via the /settings UI takes precedence.
function envDefaults(): AppSettings {
  return {
    llmBaseUrl: process.env.LLM_BASE_URL ?? "",
    llmApiKey: process.env.LLM_API_KEY ?? "",
    llmModel: process.env.LLM_MODEL ?? "",
    pexelsApiKey: process.env.PEXELS_API_KEY ?? "",
    pixabayApiKey: process.env.PIXABAY_API_KEY ?? "",
    ttsProvider: "edge-tts",
  };
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    const defaults = envDefaults();
    const created = await prisma.settings.create({
      data: { id: SETTINGS_ID, ...defaults },
    });
    return toAppSettings(created);
  }
  return toAppSettings(row);
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getSettings();
  const updated = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...current, ...patch },
    update: { ...patch },
  });
  return toAppSettings(updated);
}

function toAppSettings(row: {
  llmBaseUrl: string | null;
  llmApiKey: string | null;
  llmModel: string | null;
  pexelsApiKey: string | null;
  pixabayApiKey: string | null;
  ttsProvider: string;
}): AppSettings {
  return {
    llmBaseUrl: row.llmBaseUrl ?? "",
    llmApiKey: row.llmApiKey ?? "",
    llmModel: row.llmModel ?? "",
    pexelsApiKey: row.pexelsApiKey ?? "",
    pixabayApiKey: row.pixabayApiKey ?? "",
    ttsProvider: row.ttsProvider,
  };
}

// Same shape, with secrets replaced by a "set" marker so the settings page
// never has to round-trip real key values back to the browser.
export function maskSettings(settings: AppSettings) {
  const mask = (v: string) => (v ? "••••••••" : "");
  return {
    llmBaseUrl: settings.llmBaseUrl,
    llmModel: settings.llmModel,
    ttsProvider: settings.ttsProvider,
    llmApiKey: mask(settings.llmApiKey),
    pexelsApiKey: mask(settings.pexelsApiKey),
    pixabayApiKey: mask(settings.pixabayApiKey),
    hasLlmApiKey: Boolean(settings.llmApiKey),
    hasPexelsApiKey: Boolean(settings.pexelsApiKey),
    hasPixabayApiKey: Boolean(settings.pixabayApiKey),
  };
}
