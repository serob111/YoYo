import { describe, expect, it, vi } from "vitest";
import { ProviderApiError } from "@yoyo/integrations";
import { GeminiImageProvider } from "../gemini/gemini-image-provider";

const generateContent = vi.fn();

// vi.mock calls are hoisted above imports by vitest, so this applies before
// GeminiImageProvider's module-level `import { GoogleGenAI }` resolves.
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } }))
}));

describe("GeminiImageProvider", () => {
  it("decodes the edited image from the response's inline data part", async () => {
    const editedBytes = Buffer.from("edited-image-bytes").toString("base64");
    generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "here you go" }, { inlineData: { mimeType: "image/png", data: editedBytes } }] } }]
    });

    const provider = new GeminiImageProvider("fake-key", "gemini-3-pro-image");
    const result = await provider.edit(Buffer.from("original"), "image/jpeg", "make it a banner");

    expect(result.mimeType).toBe("image/png");
    expect(result.data.toString("utf8")).toBe("edited-image-bytes");
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3-pro-image",
        contents: [expect.objectContaining({ parts: expect.arrayContaining([expect.objectContaining({ text: "make it a banner" })]) })]
      })
    );
  });

  it("throws NON_RETRYABLE when the response has no image part", async () => {
    generateContent.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: "sorry, I can't do that" }] } }] });

    const provider = new GeminiImageProvider("fake-key", "gemini-3-pro-image");
    await expect(provider.edit(Buffer.from("original"), "image/jpeg", "make it a banner")).rejects.toMatchObject({
      category: "NON_RETRYABLE"
    });
  });

  it("classifies a 429 as RETRYABLE", async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }));

    const provider = new GeminiImageProvider("fake-key", "gemini-3-pro-image");
    const error: ProviderApiError = await provider.edit(Buffer.from("x"), "image/jpeg", "y").catch((e) => e);

    expect(error).toBeInstanceOf(ProviderApiError);
    expect(error.category).toBe("RETRYABLE");
  });

  it("classifies a 401 as ACTION_REQUIRED", async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error("invalid api key"), { status: 401 }));

    const provider = new GeminiImageProvider("fake-key", "gemini-3-pro-image");
    const error: ProviderApiError = await provider.edit(Buffer.from("x"), "image/jpeg", "y").catch((e) => e);

    expect(error.category).toBe("ACTION_REQUIRED");
  });
});
