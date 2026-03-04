const isEnabled = process.env.IMAGE_SEARCH_DEBUG === "1";

function redactUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    const shortPath =
      parsed.pathname.length > 32
        ? `${parsed.pathname.slice(0, 32)}...`
        : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${shortPath}`;
  } catch {
    return raw.length > 80 ? `${raw.slice(0, 80)}...` : raw;
  }
}

export function toDebugUrl(raw: string) {
  return redactUrl(raw);
}

export function imageSearchLog(
  event: string,
  data?: Record<string, unknown>
) {
  if (!isEnabled) {
    return;
  }

  if (data) {
    console.log(`[image-search] ${event}`, data);
  } else {
    console.log(`[image-search] ${event}`);
  }
}
