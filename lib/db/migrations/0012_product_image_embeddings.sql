CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS product_image_embeddings (
  product_id varchar(64) PRIMARY KEY REFERENCES "Product"(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  model text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_image_embeddings_hnsw_cosine
ON product_image_embeddings
USING hnsw (embedding vector_cosine_ops);
