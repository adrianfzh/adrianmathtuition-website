export function mergeTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of topics) {
    const base = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  return result;
}
