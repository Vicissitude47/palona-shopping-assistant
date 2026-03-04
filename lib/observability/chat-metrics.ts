type ChatMetricState = {
  totalRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
};

type ChatMetricSnapshot = {
  totalRequests: number;
  failedRequests: number;
  failureRate: number;
  avgLatencyMs: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __chatMetricState: ChatMetricState | undefined;
}

function getState() {
  if (!globalThis.__chatMetricState) {
    globalThis.__chatMetricState = {
      totalRequests: 0,
      failedRequests: 0,
      totalLatencyMs: 0,
    };
  }

  return globalThis.__chatMetricState;
}

export function recordChatRequestMetric({
  durationMs,
  ok,
}: {
  durationMs: number;
  ok: boolean;
}): ChatMetricSnapshot {
  const state = getState();
  state.totalRequests += 1;
  state.totalLatencyMs += Math.max(0, durationMs);

  if (!ok) {
    state.failedRequests += 1;
  }

  const avgLatencyMs =
    state.totalRequests > 0
      ? Math.round(state.totalLatencyMs / state.totalRequests)
      : 0;
  const failureRate =
    state.totalRequests > 0
      ? Number((state.failedRequests / state.totalRequests).toFixed(4))
      : 0;

  return {
    totalRequests: state.totalRequests,
    failedRequests: state.failedRequests,
    failureRate,
    avgLatencyMs,
  };
}

export function logChatRequestMetric({
  route,
  durationMs,
  ok,
  reason,
}: {
  route: string;
  durationMs: number;
  ok: boolean;
  reason?: string;
}) {
  const snapshot = recordChatRequestMetric({ durationMs, ok });
  console.info("[chat-observability] request", {
    route,
    ok,
    durationMs,
    reason,
    ...snapshot,
  });
}
