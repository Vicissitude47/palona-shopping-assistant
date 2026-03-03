import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { catalogProducts } from "@/lib/commerce/catalog";
import { product } from "./schema";

config({
  path: ".env.local",
});

const runSeed = async () => {
  if (!process.env.POSTGRES_URL) {
    console.log("POSTGRES_URL not defined, skipping seed");
    process.exit(0);
  }

  const client = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(client);

  const start = Date.now();
  await db
    .insert(product)
    .values(
      catalogProducts.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        priceCents: Math.round(item.price * 100),
        currency: item.currency,
        imageUrl: item.imageUrl,
        tags: item.tags,
        isActive: true,
        updatedAt: new Date(),
      }))
    )
    .onConflictDoUpdate({
      target: product.id,
      set: {
        name: sql`excluded."name"`,
        category: sql`excluded."category"`,
        description: sql`excluded."description"`,
        priceCents: sql`excluded."priceCents"`,
        currency: sql`excluded."currency"`,
        imageUrl: sql`excluded."imageUrl"`,
        tags: sql`excluded."tags"`,
        isActive: sql`excluded."isActive"`,
        updatedAt: sql`now()`,
      },
    });
  const end = Date.now();

  console.log(
    `Catalog seed completed: ${catalogProducts.length} products in ${end - start} ms`
  );
  await client.end();
  process.exit(0);
};

runSeed().catch((err) => {
  console.error("Catalog seed failed");
  console.error(err);
  process.exit(1);
});
