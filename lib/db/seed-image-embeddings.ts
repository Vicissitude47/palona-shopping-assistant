import { config } from "dotenv";
import {
  buildMetadataFallbackText,
  createImageEmbeddingFromUrl,
  embedText,
} from "@/lib/ai/image-embeddings";
import { catalogProducts } from "@/lib/commerce/catalog";
import {
  IMAGE_EMBEDDING_DIMENSION,
  IMAGE_EMBEDDING_MODEL,
} from "@/lib/commerce/image-search";
import postgres from "postgres";

config({
  path: ".env.local",
});

const runSeedImageEmbeddings = async () => {
  if (!process.env.POSTGRES_URL) {
    console.log("POSTGRES_URL not defined, skipping image embedding seed");
    process.exit(0);
  }

  const start = Date.now();
  const client = postgres(process.env.POSTGRES_URL, { max: 1 });
  let successCount = 0;
  let failedCount = 0;

  for (const item of catalogProducts) {
    try {
      let embedding: number[] = [];
      try {
        const imageEmbedding = await createImageEmbeddingFromUrl({
          imageUrl: item.imageUrl,
          productHint: `${item.name}; ${item.category}; ${item.tags.join(", ")}`,
        });
        embedding = imageEmbedding.embedding;
      } catch (_error) {
        const metadataFallback = buildMetadataFallbackText({
          name: item.name,
          category: item.category,
          description: item.description,
          tags: item.tags,
        });
        embedding = await embedText(metadataFallback);
        console.warn(`Vision caption fallback used: ${item.id}`);
      }

      if (embedding.length !== IMAGE_EMBEDDING_DIMENSION) {
        throw new Error(
          `Invalid embedding dimension for ${item.id}: ${embedding.length}`
        );
      }

      const vectorLiteral = `[${embedding.join(",")}]`;

      await client`
        INSERT INTO product_image_embeddings (product_id, embedding, model, updated_at)
        VALUES (${item.id}, ${vectorLiteral}::vector, ${IMAGE_EMBEDDING_MODEL}, now())
        ON CONFLICT (product_id)
        DO UPDATE SET
          embedding = EXCLUDED.embedding,
          model = EXCLUDED.model,
          updated_at = now()
      `;

      successCount += 1;
      console.log(`Seeded image embedding: ${item.id}`);
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed image embedding seed: ${item.id} - ${message}`);
    }
  }

  const end = Date.now();
  await client.end();
  console.log(
    `Image embedding seed completed: success=${successCount}, failed=${failedCount}, elapsedMs=${end - start}`
  );
};

runSeedImageEmbeddings()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Image embedding seed failed");
    console.error(err);
    process.exit(1);
  });
