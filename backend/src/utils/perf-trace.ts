import { AsyncLocalStorage } from "node:async_hooks";

type PerfEntry = {
  label: string;
  durationMs: number;
};

type PerfTrace = {
  name: string;
  startedAt: number;
  entries: PerfEntry[];
};

const perfTraceStorage = new AsyncLocalStorage<PerfTrace>();

export function isPerfTraceEnabled() {
  return process.env.MEDIVANTA_PERF_TRACE === "1";
}

export function runWithPerfTrace<T>(name: string, callback: () => Promise<T> | T) {
  if (!isPerfTraceEnabled()) {
    return callback();
  }

  return perfTraceStorage.run(
    {
      name,
      startedAt: performance.now(),
      entries: [],
    },
    callback,
  );
}

export async function measurePerfStep<T>(label: string, callback: () => Promise<T> | T) {
  const trace = perfTraceStorage.getStore();

  if (!trace) {
    return callback();
  }

  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    trace.entries.push({
      label,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  }
}

export function flushPerfTrace(statusCode?: number) {
  const trace = perfTraceStorage.getStore();

  if (!trace) {
    return;
  }

  const totalMs = Number((performance.now() - trace.startedAt).toFixed(2));
  const summary = trace.entries
    .map((entry) => `${entry.label}=${entry.durationMs}ms`)
    .join(" | ");

  console.log(
    `[perf] ${trace.name}${typeof statusCode === "number" ? ` status=${statusCode}` : ""} total=${totalMs}ms${summary ? ` | ${summary}` : ""}`,
  );
}
