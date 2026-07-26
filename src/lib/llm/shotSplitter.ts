import { z } from "zod";
import { chatComplete, extractJsonBlock } from "@/lib/llm/client";
import type { AppSettings } from "@/lib/settings";

const shotSchema = z.object({
  text: z.string().min(1),
  description: z.string().min(1),
  keywords_zh: z.array(z.string()).min(1),
  keywords_en: z.array(z.string()).min(1),
});

const responseSchema = z.object({
  shots: z.array(shotSchema).min(1),
});

export type SplitShot = z.infer<typeof shotSchema>;

const SYSTEM_PROMPT = `你是一个短视频编导助手。你会收到一整段口播文案，需要把它拆分成适合配画面的分镜（shot）。

规则：
- 按语义/停顿把文案拆成若干个分镜，每个分镜是原文案的一个连续片段（拼接所有分镜的 text 应该等于原文案，不能增删改写文字）。
- 每个分镜控制在一到三句话，不要太长也不要太短。
- 为每个分镜写一句画面描述（description），描述这段文字配什么样的画面合适。
- 为每个分镜给出用于搜索素材库的关键词：keywords_zh（1-3个中文关键词）和 keywords_en（1-3个对应的英文关键词，素材库主要用英文检索)。
- 只输出 JSON，不要输出任何其他说明文字，格式为：
{"shots":[{"text":"...","description":"...","keywords_zh":["..."],"keywords_en":["..."]}]}`;

export async function splitScriptIntoShots(
  script: string,
  settings: Pick<AppSettings, "llmBaseUrl" | "llmApiKey" | "llmModel">,
): Promise<SplitShot[]> {
  const call = () =>
    chatComplete({
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: script },
      ],
    });

  let raw = await call();
  let parsed = tryParse(raw);
  if (!parsed) {
    // one retry — occasionally a model wraps the JSON in prose despite the
    // system prompt; ask it to correct itself instead of failing outright.
    raw = await chatComplete({
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: script },
        { role: "assistant", content: raw },
        {
          role: "user",
          content: "你上一条回复不是合法 JSON，请只输出符合格式的 JSON，不要包含任何其他文字。",
        },
      ],
    });
    parsed = tryParse(raw);
  }

  if (!parsed) {
    throw new Error("LLM 未能返回合法的分镜 JSON");
  }
  return parsed.shots;
}

function tryParse(raw: string): z.infer<typeof responseSchema> | null {
  try {
    const json = extractJsonBlock(raw);
    const result = responseSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
