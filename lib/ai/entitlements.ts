import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerDay: number;
};

const DEFAULT_MAX_MESSAGES_PER_DAY = 200;

function getMaxMessagesPerDay() {
  const parsed = Number(process.env.MAX_MESSAGES_PER_DAY);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_MESSAGES_PER_DAY;
}

const maxMessagesPerDay = getMaxMessagesPerDay();

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay,
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay,
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
