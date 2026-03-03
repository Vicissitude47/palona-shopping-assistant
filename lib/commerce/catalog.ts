export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  currency: "USD";
  imageUrl: string;
  tags: string[];
};

const tokenize = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export const catalogProducts: CatalogProduct[] = [
  {
    id: "tee-001",
    name: "SwiftDry Performance T-Shirt",
    category: "t-shirt",
    description:
      "Breathable moisture-wicking tee designed for gym workouts and running.",
    price: 29,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab",
    tags: ["sports", "gym", "running", "workout", "breathable", "men", "tee"],
  },
  {
    id: "tee-002",
    name: "CoreFlex Athletic T-Shirt",
    category: "t-shirt",
    description:
      "Lightweight stretch fabric with anti-odor treatment for active days.",
    price: 35,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c",
    tags: ["sports", "training", "fitness", "stretch", "quick dry", "women"],
  },
  {
    id: "tee-003",
    name: "Everyday Cotton Crew Tee",
    category: "t-shirt",
    description: "Soft cotton crew neck for casual daily wear.",
    price: 18,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1618354691551-44de113f0164",
    tags: ["casual", "cotton", "daily", "basic", "unisex"],
  },
  {
    id: "shoe-001",
    name: "AeroRun Road Shoes",
    category: "shoes",
    description: "Cushioned running shoes for long-distance road runs.",
    price: 95,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
    tags: ["running", "sports", "road", "cushion", "training"],
  },
  {
    id: "shoe-002",
    name: "UrbanWalk Sneakers",
    category: "shoes",
    description: "Comfortable low-top sneakers for city walking.",
    price: 72,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772",
    tags: ["casual", "walking", "daily", "sneakers", "comfort"],
  },
  {
    id: "hoodie-001",
    name: "CloudWarm Fleece Hoodie",
    category: "hoodie",
    description: "Midweight fleece hoodie for cool weather.",
    price: 64,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f95609a7",
    tags: ["winter", "warm", "fleece", "casual", "layering"],
  },
  {
    id: "jacket-001",
    name: "TrailGuard Windbreaker",
    category: "jacket",
    description: "Packable windbreaker with light water resistance.",
    price: 88,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504",
    tags: ["outdoor", "hiking", "windproof", "lightweight", "rain"],
  },
  {
    id: "leggings-001",
    name: "MotionFit High-Rise Leggings",
    category: "leggings",
    description: "Supportive high-rise leggings for yoga and training.",
    price: 52,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1506629905607-c4c63dcb2d1f",
    tags: ["yoga", "sports", "training", "stretch", "women"],
  },
  {
    id: "shorts-001",
    name: "SprintLite Running Shorts",
    category: "shorts",
    description: "Quick-dry running shorts with zip pocket.",
    price: 34,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1599058917765-a780eda07a3e",
    tags: ["running", "sports", "quick dry", "summer", "men"],
  },
  {
    id: "bag-001",
    name: "Metro 20L Daypack",
    category: "bag",
    description: "Compact daypack with laptop sleeve and bottle pockets.",
    price: 49,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62",
    tags: ["backpack", "travel", "daily", "commute", "laptop"],
  },
  {
    id: "bottle-001",
    name: "HydraSteel Water Bottle 24oz",
    category: "bottle",
    description: "Insulated stainless steel bottle that keeps drinks cold.",
    price: 27,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1602143407151-7111542de6e8",
    tags: ["fitness", "sports", "hydration", "outdoor", "gym"],
  },
  {
    id: "hat-001",
    name: "SunShield Sports Cap",
    category: "hat",
    description: "Lightweight cap with sweatband and UV protection.",
    price: 22,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b",
    tags: ["sports", "outdoor", "running", "summer", "cap"],
  },
];

export type CatalogSearchResult = CatalogProduct & {
  score: number;
};

export const searchCatalog = ({
  query,
  maxPrice,
  minPrice,
  category,
  limit = 5,
}: {
  query: string;
  maxPrice?: number;
  minPrice?: number;
  category?: string;
  limit?: number;
}): CatalogSearchResult[] => {
  const queryTokens = tokenize(query);
  const normalizedCategory = category?.trim().toLowerCase();

  const filtered = catalogProducts.filter((product) => {
    if (maxPrice !== undefined && product.price > maxPrice) {
      return false;
    }
    if (minPrice !== undefined && product.price < minPrice) {
      return false;
    }
    if (
      normalizedCategory &&
      !product.category.toLowerCase().includes(normalizedCategory)
    ) {
      return false;
    }
    return true;
  });

  const scored = filtered
    .map((product) => {
      const haystack = [
        product.name,
        product.category,
        product.description,
        ...product.tags,
      ]
        .join(" ")
        .toLowerCase();

      let score = 0;
      for (const token of queryTokens) {
        if (product.tags.some((tag) => tag.toLowerCase() === token)) {
          score += 4;
          continue;
        }
        if (product.name.toLowerCase().includes(token)) {
          score += 3;
          continue;
        }
        if (product.category.toLowerCase().includes(token)) {
          score += 2;
          continue;
        }
        if (haystack.includes(token)) {
          score += 1;
        }
      }

      return { ...product, score };
    })
    .filter((product) => product.score > 0 || queryTokens.length === 0)
    .sort((a, b) => b.score - a.score || a.price - b.price);

  return scored.slice(0, limit);
};
