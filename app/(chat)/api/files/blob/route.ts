import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { imageSearchLog, toDebugUrl } from "@/lib/ai/image-search-logger";

function isBlobStorageUrl(url: URL) {
  return url.hostname.endsWith(".blob.vercel-storage.com");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  imageSearchLog("blob-proxy:start", {
    hasUrl: Boolean(rawUrl),
    url: rawUrl ? toDebugUrl(rawUrl) : undefined,
  });

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!isBlobStorageUrl(parsed)) {
    imageSearchLog("blob-proxy:unsupported-host", {
      host: parsed.hostname,
    });
    return NextResponse.json({ error: "Unsupported host" }, { status: 400 });
  }

  const access = parsed.hostname.includes(".private.")
    ? "private"
    : "public";
  const result = await get(parsed.toString(), { access });
  imageSearchLog("blob-proxy:get-result", {
    access,
    found: Boolean(result),
    url: toDebugUrl(parsed.toString()),
  });

  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Blob not found" }, { status: 404 });
  }

  return new Response(result.stream, {
    status: 200,
    headers: {
      "content-type": result.blob.contentType,
      "cache-control": "private, max-age=60",
    },
  });
}
