import { tool } from "ai";
import { z } from "zod";
import { searchCatalogProducts } from "@/lib/db/queries";

const tokenize = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function buildRecommendationReason({
  query,
  productName,
  productCategory,
  productDescription,
  minPrice,
  maxPrice,
}: {
  query: string;
  productName: string;
  productCategory: string;
  productDescription: string;
  minPrice?: number;
  maxPrice?: number;
}) {
  const haystack = `${productName} ${productCategory} ${productDescription}`.toLowerCase();
  const tokens = tokenize(query);
  const matchedTokens = tokens.filter((token) => haystack.includes(token));

  const reasons: string[] = [];
  if (matchedTokens.length > 0) {
    reasons.push(`Matches: ${matchedTokens.slice(0, 2).join(", ")}`);
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    const lower = minPrice !== undefined ? `$${minPrice}` : "any";
    const upper = maxPrice !== undefined ? `$${maxPrice}` : "any";
    reasons.push(`Budget range ${lower} - ${upper}`);
  }

  if (reasons.length === 0) {
    reasons.push("Closest catalog match for your request");
  }

  return reasons.slice(0, 2).join(" | ");
}

export const searchCatalogTool = tool({
  description:
    "Search products in the predefined shopping catalog and return matching products only from that catalog.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("What the user is looking for, such as 'sports t-shirt'"),
    category: z
      .string()
      .optional()
      .describe("Optional category filter, such as t-shirt or shoes"),
    minPrice: z.number().optional().describe("Optional minimum price in USD"),
    maxPrice: z.number().optional().describe("Optional maximum price in USD"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Number of products to return"),
  }),
  execute: async ({ query, category, minPrice, maxPrice, limit }) => {
    const matches = await searchCatalogProducts({
      query,
      category,
      minPrice,
      maxPrice,
      limit: limit ?? 5,
    });

    return {
      query,
      total: matches.length,
      fallbackMessage:
        matches.length === 0
          ? "No exact catalog match found. Try another category, looser budget, or upload a product image."
          : undefined,
      products: matches.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        price: item.price,
        currency: item.currency,
        imageUrl: item.imageUrl,
        reason: buildRecommendationReason({
          query,
          productName: item.name,
          productCategory: item.category,
          productDescription: item.description,
          minPrice,
          maxPrice,
        }),
        ctaLabel: "View Product",
        ctaUrl: item.imageUrl,
      })),
    };
  },
});
