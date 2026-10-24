// Opt-in diagnostics; bounded and read-only, never stores workbook contents.
export const performanceEnabled =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("perf");
export function measured(name: string, start: number) {
  if (!performanceEnabled) return;
  performance.measure(`supply:${name}`, { start, end: performance.now() });
  const entries = performance.getEntriesByName(`supply:${name}`);
  if (entries.length > 200) performance.clearMeasures(`supply:${name}`);
}
