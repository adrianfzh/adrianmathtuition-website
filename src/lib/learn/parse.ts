// Robustly pull a JSON object out of an LLM response — tolerates ```json fences
// and prose before/after the object. Throws on genuinely malformed JSON.
export function parseJson(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}
