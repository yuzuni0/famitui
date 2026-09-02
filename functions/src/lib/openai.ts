import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

export const openaiApiKey = defineSecret("OPENAI_API_KEY");

export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const OPENAI_MODEL = "gpt-4o";

// カテゴリの判定にOpenAIを使う
export async function requestClassification(
  prompt: string,
  maxTokens: number,
  logContext: Record<string, unknown>
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (fetchError) {
    logger.error("カテゴリの判定を呼び出せません", {
      ...logContext,
      fetchError,
    });
    return null;
  }

  if (!response.ok) {
    logger.error("カテゴリの判定に失敗しました", {
      ...logContext,
      status: response.status,
      body: await response.text(),
    });
    return null;
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    logger.error("カテゴリの判定の結果を受け取れませんでした", logContext);
    return null;
  }
  return content;
}
