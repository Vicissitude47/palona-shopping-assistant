import { gateway } from "@ai-sdk/gateway";
import { get } from "@vercel/blob";
import { embed, generateText } from "ai";
import { imageSearchLog, toDebugUrl } from "@/lib/ai/image-search-logger";
import {
  IMAGE_CAPTION_MODEL,
  IMAGE_CAPTION_FALLBACK_MODEL,
  IMAGE_EMBEDDING_MODEL,
} from "@/lib/commerce/image-search";

async function captionImageWithModel({
  modelId,
  image,
  hintText,
}: {
  modelId: string;
  image: URL | string;
  hintText: string;
}) {
  imageSearchLog("caption:start", {
    modelId,
    imageType: typeof image === "string" ? "string" : "url",
    isDataUrl: typeof image === "string" && image.startsWith("data:"),
  });
  const { text } = await generateText({
    model: gateway.languageModel(modelId),
    maxOutputTokens: 140,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Describe this product image in one compact sentence for similarity search.
Focus on item type, style, color, material, and likely use-case.
Return plain text only.
${hintText}`,
          },
          {
            type: "image",
            image,
          },
        ],
      },
    ],
  });

  imageSearchLog("caption:done", {
    modelId,
    captionLength: text.length,
  });
  return text.trim();
}

function isPrivateBlobUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.endsWith(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function unwrapBlobProxyUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const nestedUrl = parsed.searchParams.get("url");
    if (parsed.pathname.endsWith("/api/files/blob") && nestedUrl) {
      return nestedUrl;
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}

async function fetchImageAsDataUrl(rawUrl: string) {
  imageSearchLog("fetch-image:start", { url: toDebugUrl(rawUrl) });
  const response = await fetch(rawUrl, { redirect: "follow" });
  if (!response.ok) {
    imageSearchLog("fetch-image:failed-status", {
      url: toDebugUrl(rawUrl),
      status: response.status,
    });
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    imageSearchLog("fetch-image:failed-type", {
      url: toDebugUrl(rawUrl),
      contentType,
    });
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  imageSearchLog("fetch-image:done", {
    url: toDebugUrl(rawUrl),
    contentType,
    bytes: arrayBuffer.byteLength,
  });
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

async function toModelImageInput(imageUrl: string): Promise<URL | string> {
  if (imageUrl.startsWith("data:")) {
    imageSearchLog("to-model-image:data-url-input");
    return imageUrl;
  }

  const unwrappedUrl = unwrapBlobProxyUrl(imageUrl);
  imageSearchLog("to-model-image:resolved-url", {
    inputUrl: toDebugUrl(imageUrl),
    resolvedUrl: toDebugUrl(unwrappedUrl),
    isPrivateBlob: isPrivateBlobUrl(unwrappedUrl),
  });

  if (isPrivateBlobUrl(unwrappedUrl)) {
    const blob = await get(unwrappedUrl, { access: "private" });
    if (!blob || blob.statusCode !== 200) {
      imageSearchLog("to-model-image:private-get-failed", {
        url: toDebugUrl(unwrappedUrl),
      });
      throw new Error("Failed to fetch private blob image");
    }

    const arrayBuffer = await new Response(blob.stream).arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mime = blob.blob.contentType || "image/jpeg";
    imageSearchLog("to-model-image:private-get-done", {
      url: toDebugUrl(unwrappedUrl),
      mime,
      bytes: arrayBuffer.byteLength,
    });
    return `data:${mime};base64,${base64}`;
  }

  return await fetchImageAsDataUrl(unwrappedUrl);
}

export async function captionImageFromUrl({
  imageUrl,
  productHint,
}: {
  imageUrl: string;
  productHint?: string;
}) {
  imageSearchLog("caption-from-url:start", {
    imageUrl: toDebugUrl(imageUrl),
  });
  const hintText = productHint ? `Product hint: ${productHint}` : "";
  const image = await toModelImageInput(imageUrl);
  try {
    return await captionImageWithModel({
      modelId: IMAGE_CAPTION_MODEL,
      image,
      hintText,
    });
  } catch (_error) {
    imageSearchLog("caption-from-url:fallback-model", {
      fallbackModel: IMAGE_CAPTION_FALLBACK_MODEL,
    });
    return await captionImageWithModel({
      modelId: IMAGE_CAPTION_FALLBACK_MODEL,
      image,
      hintText,
    });
  }
}

export function buildMetadataFallbackText({
  name,
  category,
  description,
  tags,
}: {
  name: string;
  category: string;
  description: string;
  tags: string[];
}) {
  return `${name}. Category: ${category}. ${description}. Tags: ${tags.join(
    ", "
  )}.`;
}

export async function embedText(value: string) {
  imageSearchLog("embed:start", {
    model: IMAGE_EMBEDDING_MODEL,
    textLength: value.length,
  });
  const { embedding } = await embed({
    model: gateway.embeddingModel(IMAGE_EMBEDDING_MODEL),
    value,
  });

  imageSearchLog("embed:done", { dimensions: embedding.length });
  return embedding;
}

export async function createImageEmbeddingFromUrl({
  imageUrl,
  productHint,
}: {
  imageUrl: string;
  productHint?: string;
}) {
  imageSearchLog("create-image-embedding:start", {
    imageUrl: toDebugUrl(imageUrl),
  });
  const caption = await captionImageFromUrl({ imageUrl, productHint });
  const embedding = await embedText(caption);

  imageSearchLog("create-image-embedding:done", {
    captionLength: caption.length,
    dimensions: embedding.length,
  });
  return {
    caption,
    embedding,
    model: IMAGE_EMBEDDING_MODEL,
  };
}
