"use client";

import { SparklesIcon } from "lucide-react";
import { catalogProducts } from "@/lib/commerce/catalog";
import { Button } from "./ui/button";

export function StorefrontPanel({
  onQuickAsk,
}: {
  onQuickAsk: (prompt: string) => void;
}) {
  const featuredProducts = catalogProducts;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-gradient-to-r from-orange-50 via-amber-50 to-lime-50 px-6 py-6 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
        <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
          Shopping Assistant
        </p>
        <h1 className="mt-2 font-semibold text-2xl tracking-tight">
          Discover Your Next Favorite Item
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
          Browse the catalog and ask the assistant for personalized picks based
          on budget, style, or uploaded images.
        </p>
      </div>

      <div className="grid gap-4 overflow-y-auto bg-muted/20 p-6 sm:grid-cols-2 xl:grid-cols-3">
        {featuredProducts.map((product) => (
          <article
            className="group flex flex-col overflow-hidden rounded-xl border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            key={product.id}
          >
            <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-muted/50 p-2">
              <img
                alt={product.name}
                className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                src={product.imageUrl}
              />
            </div>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tracking-wide uppercase">
                  {product.category}
                </span>
                <span className="font-medium text-sm">${product.price}</span>
              </div>
              <h2 className="line-clamp-1 font-medium text-sm">{product.name}</h2>
              <p className="line-clamp-2 text-muted-foreground text-xs">
                {product.description}
              </p>
              <Button
                className="mt-auto w-full"
                onClick={() => {
                  onQuickAsk(
                    `Recommend something similar to ${product.name} under $${
                      product.price + 20
                    }`
                  );
                }}
                size="sm"
                variant="outline"
              >
                <SparklesIcon className="mr-1 h-3.5 w-3.5" />
                Ask Assistant
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
