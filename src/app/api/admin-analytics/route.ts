import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

const PRICING: Record<string, { in: number; out: number }> = {
  'Claude Sonnet 4.6':               { in: 3.00,  out: 15.00 },
  'Claude Sonnet 4.6 (jStat)':       { in: 3.00,  out: 15.00 },
  'Claude Opus 4.6':                 { in: 15.00, out: 75.00 },
  'Claude Opus 4.6 (regen)':         { in: 15.00, out: 75.00 },
  'Gemini 3.1 Flash-Lite':           { in: 0.25,  out: 1.50  },
  'GPT-5.4':                         { in: 2.50,  out: 15.00 },
  'Claude Haiku':                    { in: 0.80,  out: 4.00  },
};

function costForRecord(r: any): number {
  const model = r.fields['Model Used'] || '';
  const p = PRICING[model] || { in: 0, out: 0 };
  return (r.fields['Tokens In'] || 0) / 1e6 * p.in
       + (r.fields['Tokens Out'] || 0) / 1e6 * p.out;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp   = req.nextUrl.searchParams;
  const days = Math.min(parseInt(sp.get('days') || '7', 10), 90);
  const adminChatId = process.env.ADMIN_CHAT_ID || process.env.ADRIAN_CHAT_ID || '';

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const formula = encodeURIComponent(`IS_AFTER({Timestamp},'${since}')`);

  const fields = [
    'Chat ID','Username','Student','Timestamp',
    'Caption','AI Response','Model Used','Confidence',
    'Rating','Time Taken','Tokens In','Tokens Out',
    'Image URL','Telegram File ID','Topic',
  ];
  const qs = `filterByFormula=${formula}&sort[0][field]=Timestamp&sort[0][direction]=desc`
           + fields.map(f => `&fields[]=${encodeURIComponent(f)}`).join('');

  const data = await airtableRequestAll('Questions', `?${qs}`);
  // Filter out admin test questions
  const records = data.records.filter((r: any) =>
    !adminChatId || (r.fields['Chat ID'] || '') !== adminChatId
  );

  // ── Per-model stats ───────────────────────────────────────────────────────
  const modelMap: Record<string, { count: number; tokIn: number; tokOut: number; totalTime: number; cost: number }> = {};
  let totalCost = 0;

  for (const r of records) {
    const model = r.fields['Model Used'] || 'Unknown';
    if (!modelMap[model]) modelMap[model] = { count: 0, tokIn: 0, tokOut: 0, totalTime: 0, cost: 0 };
    modelMap[model].count++;
    modelMap[model].tokIn    += r.fields['Tokens In']  || 0;
    modelMap[model].tokOut   += r.fields['Tokens Out'] || 0;
    modelMap[model].totalTime += r.fields['Time Taken'] || 0;
    const c = costForRecord(r);
    modelMap[model].cost += c;
    totalCost += c;
  }

  const modelStats = Object.entries(modelMap)
    .map(([model, s]) => ({
      model,
      count: s.count,
      avgTime:   s.count ? +(s.totalTime / s.count).toFixed(1) : 0,
      avgTokIn:  s.count ? Math.round(s.tokIn  / s.count) : 0,
      avgTokOut: s.count ? Math.round(s.tokOut / s.count) : 0,
      totalTokIn:  s.tokIn,
      totalTokOut: s.tokOut,
      cost: +s.cost.toFixed(4),
    }))
    .sort((a, b) => b.count - a.count);

  // ── Daily volume trend ────────────────────────────────────────────────────
  const trendByDay: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000 + 8 * 3600_000).toISOString().slice(0, 10);
    trendByDay[d] = 0;
  }
  for (const r of records) {
    const ts = r.fields['Timestamp'] || '';
    if (!ts) continue;
    // Convert to SGT day
    const sgt = new Date(new Date(ts).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    if (sgt in trendByDay) trendByDay[sgt]++;
  }
  const trend = Object.entries(trendByDay).map(([date, count]) => ({ date, count }));

  // ── Topic breakdown ───────────────────────────────────────────────────────
  const topicMap: Record<string, number> = {};
  for (const r of records) {
    const t = r.fields['Topic'] || 'unclassified';
    topicMap[t] = (topicMap[t] || 0) + 1;
  }
  const topics = Object.entries(topicMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([topic, count]) => ({ topic, count }));

  // ── Recent questions (first 50, newest first) ─────────────────────────────
  const questions = records.slice(0, 50).map((r: any) => ({
    id:         r.id,
    timestamp:  r.fields['Timestamp'] || '',
    username:   r.fields['Username'] || '',
    caption:    (r.fields['Caption'] || '').slice(0, 300),
    response:   (r.fields['AI Response'] || '').slice(0, 500),
    model:      r.fields['Model Used'] || '',
    confidence: r.fields['Confidence'] || '',
    rating:     r.fields['Rating'] || '',
    timeTaken:  r.fields['Time Taken'] ?? null,
    topic:      r.fields['Topic'] || '',
    hasImage:   !!(r.fields['Telegram File ID'] || r.fields['Image URL']),
    cost:       +costForRecord(r).toFixed(5),
  }));

  return NextResponse.json({
    totalQuestions: records.length,
    totalCost: +totalCost.toFixed(4),
    modelStats,
    trend,
    topics,
    questions,
  });
}

// POST — trigger on-demand AI analysis of recent questions
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { days = 1 } = await req.json().catch(() => ({}));
  const adminChatId = process.env.ADMIN_CHAT_ID || process.env.ADRIAN_CHAT_ID || '';
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const formula = encodeURIComponent(`IS_AFTER({Timestamp},'${since}')`);
  const qs = `filterByFormula=${formula}&sort[0][field]=Timestamp&sort[0][direction]=asc`
           + `&fields[]=Username&fields[]=Caption&fields[]=AI Response&fields[]=Model Used&fields[]=Confidence&fields[]=Rating&fields[]=Time Taken&fields[]=Chat ID`;

  const data = await airtableRequestAll('Questions', `?${qs}`);
  const records = data.records.filter((r: any) =>
    !adminChatId || (r.fields['Chat ID'] || '') !== adminChatId
  );

  if (records.length === 0) {
    return NextResponse.json({ analysis: 'No questions in the selected period.' });
  }

  const logForAI = records.slice(0, 80).map((r: any) => ({
    username:   r.fields['Username'] || 'unknown',
    model:      r.fields['Model Used'] || '?',
    question:   (r.fields['Caption'] || '').slice(0, 300),
    answer:     (r.fields['AI Response'] || '').slice(0, 400),
    confidence: r.fields['Confidence'] || null,
    rating:     r.fields['Rating'] || null,
    timeTaken:  r.fields['Time Taken'] || null,
  }));

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `You are reviewing a math tutoring bot's performance log (admin test messages excluded).\n\nPeriod: last ${days} day${days !== 1 ? 's' : ''} (${records.length} questions)\n\n${JSON.stringify(logForAI, null, 2)}\n\nGive a concise 4–6 sentence summary:\n1. Overall answer quality\n2. Topic/difficulty patterns\n3. Any concerns (fallbacks, low confidence, slow responses)\n4. One actionable improvement recommendation\n\nBe direct. No bullet points.`,
      }],
    }),
  });

  const json: any = await res.json();
  const analysis = json.content?.[0]?.text || 'Analysis failed.';
  return NextResponse.json({ analysis, questionCount: records.length });
}
