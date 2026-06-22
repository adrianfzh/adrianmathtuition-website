// Single source of truth for model pricing (USD per 1M tokens). Used by the
// analytics cost dashboard AND the bot-analytics per-question cost.
export const PRICING: Record<string, { in: number; out: number }> = {
  'Claude Opus 4.8':       { in: 15.00, out: 75.00 },
  'Claude Opus 4.6':       { in: 15.00, out: 75.00 },
  'Claude Sonnet 4.6':     { in: 3.00,  out: 15.00 },
  'Claude Haiku':          { in: 0.80,  out: 4.00  },
  'Gemini 3.1 Flash-Lite': { in: 0.25,  out: 1.50  },
  'Gemini 3.1 Pro':        { in: 1.25,  out: 10.00 },
  'GPT-5.4':               { in: 2.50,  out: 15.00 },
  'DeepSeek V4 Pro':       { in: 0.27,  out: 1.10  },
  'Kimi':                  { in: 0.60,  out: 2.50  },
};

// Resolve a logged model name (which may carry path/purpose suffixes like
// "(web)" / "(regen)" / "(verified)") to its per-1M pricing, falling back to the
// model FAMILY by keyword so a new variant never silently costs $0.
export function priceForModel(model: string): { in: number; out: number } {
  let base = (model || '').trim();
  while (/\s*\([^)]*\)\s*$/.test(base)) base = base.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (PRICING[base]) return PRICING[base];
  const lc = base.toLowerCase();
  if (lc.includes('opus')) return { in: 15.00, out: 75.00 };
  if (lc.includes('sonnet')) return { in: 3.00, out: 15.00 };
  if (lc.includes('haiku')) return { in: 0.80, out: 4.00 };
  if (lc.includes('gemini') && lc.includes('pro')) return { in: 1.25, out: 10.00 };
  if (lc.includes('gemini')) return { in: 0.25, out: 1.50 };
  if (lc.includes('gpt')) return { in: 2.50, out: 15.00 };
  if (lc.includes('deepseek')) return { in: 0.27, out: 1.10 };
  if (lc.includes('kimi')) return { in: 0.60, out: 2.50 };
  return { in: 0, out: 0 };
}

export function costFor(tokensIn: number, tokensOut: number, model: string): number {
  const p = priceForModel(model);
  return (tokensIn || 0) / 1e6 * p.in + (tokensOut || 0) / 1e6 * p.out;
}
