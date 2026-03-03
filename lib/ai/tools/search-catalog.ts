import { tool } from "ai";
import { z } from "zod";
import { searchCatalogProducts } from "@/lib/db/queries";

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
      products: matches.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        price: item.price,
        currency: item.currency,
        imageUrl: item.imageUrl,
      })),
    };
  },
});
