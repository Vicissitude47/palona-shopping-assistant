DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'priceCents'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "priceCents" integer DEFAULT 0 NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'pricecents'
  ) THEN
    EXECUTE 'UPDATE "Product" SET "priceCents" = COALESCE("priceCents", "pricecents")';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'price_cents'
  ) THEN
    EXECUTE 'UPDATE "Product" SET "priceCents" = COALESCE("priceCents", "price_cents")';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'imageUrl'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "imageUrl" text DEFAULT '' NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'imageurl'
  ) THEN
    EXECUTE 'UPDATE "Product" SET "imageUrl" = COALESCE(NULLIF("imageUrl", ''''), "imageurl")';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'image_url'
  ) THEN
    EXECUTE 'UPDATE "Product" SET "imageUrl" = COALESCE(NULLIF("imageUrl", ''''), "image_url")';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'isActive'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'isactive'
  ) THEN
    EXECUTE 'UPDATE "Product" SET "isActive" = COALESCE("isActive", "isactive")';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'is_active'
  ) THEN
    EXECUTE 'UPDATE "Product" SET "isActive" = COALESCE("isActive", "is_active")';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'currency'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "currency" varchar(3) DEFAULT 'USD' NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'tags'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "tags" json DEFAULT '[]'::json NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Product_priceCents_idx" ON "Product" USING btree ("priceCents");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON "Product" USING btree ("isActive");
