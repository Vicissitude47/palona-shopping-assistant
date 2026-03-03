CREATE TABLE IF NOT EXISTS "Product" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"priceCents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"imageUrl" text NOT NULL,
	"tags" json NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Product_priceCents_idx" ON "Product" USING btree ("priceCents");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON "Product" USING btree ("isActive");
