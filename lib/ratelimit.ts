import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { ChatbotError } from "@/lib/errors";

const DEFAULT_IP_MAX_MESSAGES_PER_DAY = 200;
const TTL_SECONDS = 60 * 60 * 24;

function getIpMaxMessagesPerDay() {
  const parsed = Number(process.env.IP_MAX_MESSAGES_PER_DAY);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_IP_MAX_MESSAGES_PER_DAY;
}

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => {});
    client.connect().catch(() => {
      client = null;
    });
  }
  return client;
}

export async function checkIpRateLimit(ip: string | undefined) {
  if (!isProductionEnvironment || !ip) return;

  const redis = getClient();
  if (!redis?.isReady) return;

  try {
    const key = `ip-rate-limit:${ip}`;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, TTL_SECONDS, "NX")
      .exec();

    if (
      typeof count === "number" &&
      count > getIpMaxMessagesPerDay()
    ) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (error) {
    if (error instanceof ChatbotError) throw error;
  }
}
