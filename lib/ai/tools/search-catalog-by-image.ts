import { tool } from "ai";
import { z } from "zod";
import { createImageEmbeddingFromUrl } from "@/lib/ai/image-embeddings";
import { imageSearchLog, toDebugUrl } from "@/lib/ai/image-search-logger";
import { searchCatalogProductsByImageEmbedding } from "@/lib/db/queries";

function buildSimilarityReason(similarity: number) {
  if (similarity >= 0.9) {
    return "Very strong visual match";
  }
  if (similarity >= 0.75) {
    return "Strong visual match";
  }
  if (similarity >= 0.6) {
    return "Moderate visual match";
  }
  return "Loose visual match";
}

export const searchCatalogByImageTool = tool({
  description:
    "Find similar products from the predefined shopping catalog using an image URL. Return catalog products only.",
  inputSchema: z.object({
    imageUrl: z.string().url().describe("Public image URL to search against"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Number of products to return"),
  }),
  execute: async ({ imageUrl, limit }) => {
    imageSearchLog("tool:searchCatalogByImage:start", {
      imageUrl: toDebugUrl(imageUrl),
      limit: limit ?? 5,
    });

    try {
      const { embedding, model } = await createImageEmbeddingFromUrl({
        imageUrl,
      });
      const matches = await searchCatalogProductsByImageEmbedding({
        embedding,
        limit: limit ?? 5,
      });

      imageSearchLog("tool:searchCatalogByImage:done", {
        total: matches.length,
      });

      return {
        imageUrl,
        embeddingModel: model,
        total: matches.length,
        fallbackMessage:
          matches.length === 0
            ? "No close visual match found in catalog. Try another angle or describe the product in text."
            : undefined,
        products: matches.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          description: item.description,
          price: item.price,
          currency: item.currency,
          imageUrl: item.imageUrl,
          similarity: item.similarity,
          reason: buildSimilarityReason(item.similarity),
          ctaLabel: "View Product",
          ctaUrl: item.imageUrl,
        })),
      };
    } catch (error) {
      imageSearchLog("tool:searchCatalogByImage:failed", {
        imageUrl: toDebugUrl(imageUrl),
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        imageUrl,
        embeddingModel: "unavailable",
        total: 0,
        products: [],
        fallbackMessage:
          "I could not access this image reliably. Please re-upload or add a short text description (category, color, style).",
        errorCode: "image_access_failed",
      };
    }
  },
});
