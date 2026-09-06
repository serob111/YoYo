import { GoogleGenAI } from "@google/genai";
import { ProviderApiError, type ProviderFailureCategory } from "@yoyo/integrations";
import type { ImageEditProvider, ImageEditResult } from "../types";

/**
 * Wraps Google's Gemini image-editing model ("Nano Banana" family) for the
 * Phase 6 "turn an uploaded photo into a marketing banner" feature, via the
 * SDK's standard ai.models.generateContent() call (image-in/image-out is just
 * a multimodal generateContent request - there is no separate "edit" method
 * in @google/genai; verified against the installed SDK's own .d.ts, not just
 * docs, since an initial doc-derived draft of this file didn't match the
 * actual shipped API). Model is always a per-call constructor parameter,
 * never hardcoded, same convention as AnthropicProvider.
 */
export class GeminiImageProvider implements ImageEditProvider {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async edit(image: Buffer, mimeType: string, instruction: string): Promise<ImageEditResult> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [{ text: instruction }, { inlineData: { mimeType, data: image.toString("base64") } }]
          }
        ]
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((part) => part.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        throw new ProviderApiError("Gemini image edit returned no output image", "NON_RETRYABLE");
      }

      return { data: Buffer.from(imagePart.inlineData.data, "base64"), mimeType: imagePart.inlineData.mimeType ?? mimeType };
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;
      throw classifyGeminiError(error);
    }
  }
}

function classifyGeminiError(error: unknown): ProviderApiError {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;

  let category: ProviderFailureCategory;
  if (status === 401 || status === 403) {
    category = "ACTION_REQUIRED"; // invalid/missing API key - retrying is pointless
  } else if (status === 429 || (status !== undefined && status >= 500)) {
    category = "RETRYABLE";
  } else if (status !== undefined && status >= 400) {
    category = "NON_RETRYABLE";
  } else {
    category = "RETRYABLE";
  }

  return new ProviderApiError(`Gemini image edit failed: ${message}`, category, status);
}
