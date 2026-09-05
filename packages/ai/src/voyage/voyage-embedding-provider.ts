import type { EmbeddingInputType, EmbeddingProvider, EmbeddingResult } from "../types";

// Voyage AI has no official Node SDK (Anthropic's own SDK only covers the
// Messages API), so this is raw HTTP against their documented REST endpoint -
// see https://docs.voyageai.com/reference/embeddings-api.
const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageEmbeddingDatum {
  object: "embedding";
  embedding: number[];
  index: number;
}

interface VoyageEmbeddingsResponse {
  object: "list";
  data: VoyageEmbeddingDatum[];
  model: string;
  usage: { total_tokens: number };
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly outputDimension = 1024
  ) {}

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<EmbeddingResult> {
    const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        input_type: inputType,
        output_dimension: this.outputDimension
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage embeddings request failed with status ${response.status}: ${body}`);
    }

    const body = (await response.json()) as VoyageEmbeddingsResponse;
    const vectors = [...body.data].sort((a, b) => a.index - b.index).map((datum) => datum.embedding);

    return { vectors, totalTokens: body.usage.total_tokens };
  }
}
