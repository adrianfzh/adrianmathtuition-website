// GET /api/admin/metrics
// Aggregates bot performance metrics from Supabase (conversation_history)
// and Airtable (Questions table).
//
// Requires SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in Vercel
// env vars (bypasses RLS). Falls back to SUPABASE_ANON_KEY if neither is set.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  const cookie = req.cookies.get('admin_pw')?.value;
  return req.headers.get('authorization') === `Bearer ${pw}` || cookie === pw;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

async function airtableFetch(path: string) {
  const base = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_TOKEN;
  const res = await fetch(`https://api.airtable.com/v0/${base}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function airtableFetchAll(table: string, query: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const qs = offset ? `${query}&offset=${offset}` : query;
    const data = await airtableFetch(`${encodeURIComponent(table)}?${qs}`);
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const d14 = new Date(now.getTime() - 14 * 86400_000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString();

  // ── Supabase queries ──────────────────────────────────────────────────────
  const [
    histCurr, histPrior,
    dailyRows, versionRows, latencyRows,
  ] = await Promise.all([
    // Current 7d — user messages
    sb.from('conversation_history')
      .select('chat_id, was_followup, had_image, model_used, bot_version', { count: 'exact' })
      .eq('role', 'user').gte('created_at', d7),
    // Prior 7d — user messages
    sb.from('conversation_history')
      .select('chat_id, was_followup', { count: 'exact' })
      .eq('role', 'user').gte('created_at', d14).lt('created_at', d7),
    // Daily volume (last 30d) — assistant messages = bot answers
    sb.from('conversation_history')
      .select('created_at')
      .eq('role', 'assistant').gte('created_at', d30),
    // Per bot version (last 60d)
    sb.from('conversation_history')
      .select('bot_version, role, was_followup, latency_ms')
      .gte('created_at', new Date(now.getTime() - 60 * 86400_000).toISOString()),
    // Latency (last 7d assistant messages)
    sb.from('conversation_history')
      .select('latency_ms').eq('role', 'assistant').gte('created_at', d7).not('latency_ms', 'is', null),
  ]);

  const currRows: any[] = histCurr.data || [];
  const priorRows: any[] = histPrior.data || [];

  // Headline — current 7d
  const activeStudentsCurr = new Set(currRows.map(r => r.chat_id)).size;
  const totalMsgCurr = histCurr.count ?? currRows.length;
  const followupCurr = currRows.filter(r => r.was_followup).length;
  const followupRateCurr = totalMsgCurr > 0 ? (followupCurr / totalMsgCurr * 100) : 0;
  const latencyData: number[] = (latencyRows.data || []).map((r: any) => r.latency_ms).filter(Boolean);
  const avgLatency = latencyData.length > 0 ? Math.round(latencyData.reduce((a, b) => a + b, 0) / latencyData.length) : 0;

  // Headline — prior 7d
  const activeStudentsPrior = new Set(priorRows.map(r => r.chat_id)).size;
  const totalMsgPrior = histPrior.count ?? priorRows.length;
  const followupPrior = priorRows.filter((r: any) => r.was_followup).length;
  const followupRatePrior = totalMsgPrior > 0 ? (followupPrior / totalMsgPrior * 100) : 0;

  // Daily volume
  const dailyMap: Record<string, number> = {};
  for (const r of (dailyRows.data || [])) {
    const day = (r.created_at as string).slice(0, 10);
    dailyMap[day] = (dailyMap[day] || 0) + 1;
  }
  // Fill in last 30 days
  const dailyVolume: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    dailyVolume.push({ date: key, count: dailyMap[key] || 0 });
  }

  // Per-version comparison
  const vdata: any[] = versionRows.data || [];
  const vMap: Record<string, { msgs: number; followups: number; latencies: number[]; userMsgs: number }> = {};
  for (const r of vdata) {
    if (!r.bot_version) continue;
    if (!vMap[r.bot_version]) vMap[r.bot_version] = { msgs: 0, followups: 0, latencies: [], userMsgs: 0 };
    vMap[r.bot_version].msgs++;
    if (r.role === 'user') {
      vMap[r.bot_version].userMsgs++;
      if (r.was_followup) vMap[r.bot_version].followups++;
    }
    if (r.role === 'assistant' && r.latency_ms) vMap[r.bot_version].latencies.push(r.latency_ms);
  }
  const versionComparison = Object.entries(vMap)
    .sort((a, b) => b[1].msgs - a[1].msgs)
    .slice(0, 8)
    .map(([version, v]) => ({
      version,
      totalMessages: v.msgs,
      userMessages: v.userMsgs,
      followupRate: v.userMsgs > 0 ? +(v.followups / v.userMsgs * 100).toFixed(1) : 0,
      avgLatencyMs: v.latencies.length > 0 ? Math.round(v.latencies.reduce((a, b) => a + b, 0) / v.latencies.length) : null,
    }));

  // ── Airtable Questions ─────────────────────────────────────────────────────
  const since14 = new Date(d14).toISOString();
  const since7  = new Date(d7).toISOString();

  const allQs = await airtableFetchAll('Questions',
    `filterByFormula=${encodeURIComponent(`IS_AFTER({Timestamp},'${since14}')`)}&fields[]=Timestamp&fields[]=Confidence&fields[]=Status&fields[]=Topic&fields[]=Chat+ID&fields[]=Time+Taken`
  );

  const currQs = allQs.filter(r => r.fields['Timestamp'] >= since7);
  const priorQs = allQs.filter(r => r.fields['Timestamp'] < since7);

  function qStats(qs: any[]) {
    const total = qs.length;
    const lowConf = qs.filter(r => (r.fields['Confidence'] || '').toLowerCase() === 'low').length;
    const pushback = qs.filter(r => r.fields['Status'] === 'negative_feedback').length;
    const activeStudents = new Set(qs.map(r => r.fields['Chat ID']).filter(Boolean)).size;
    const times = qs.map(r => r.fields['Time Taken']).filter(Boolean);
    const avgTime = times.length > 0 ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length) : 0;
    return { total, lowConf, pushback, activeStudents, avgTime,
      lowConfRate: total > 0 ? +(lowConf / total * 100).toFixed(1) : 0,
      pushbackRate: total > 0 ? +(pushback / total * 100).toFixed(1) : 0,
    };
  }

  const curr = qStats(currQs);
  const prior = qStats(priorQs);

  // Topic friction
  const topicMap: Record<string, { total: number; lowConf: number; pushback: number }> = {};
  for (const r of currQs) {
    const topic = r.fields['Topic'] || 'Unknown';
    if (!topicMap[topic]) topicMap[topic] = { total: 0, lowConf: 0, pushback: 0 };
    topicMap[topic].total++;
    if ((r.fields['Confidence'] || '').toLowerCase() === 'low') topicMap[topic].lowConf++;
    if (r.fields['Status'] === 'negative_feedback') topicMap[topic].pushback++;
  }
  const topicFriction = Object.entries(topicMap)
    .filter(([, v]) => v.total >= 2)
    .sort((a, b) => (b[1].lowConf + b[1].pushback) - (a[1].lowConf + a[1].pushback))
    .slice(0, 15)
    .map(([topic, v]) => ({
      topic,
      total: v.total,
      lowConfRate: +(v.lowConf / v.total * 100).toFixed(1),
      pushbackRate: +(v.pushback / v.total * 100).toFixed(1),
      frictionScore: +(((v.lowConf + v.pushback) / v.total) * 100).toFixed(1),
    }));

  // Top friction students (last 14d)
  const studentMap: Record<string, { total: number; lowConf: number; pushback: number }> = {};
  for (const r of allQs) {
    const chatId = r.fields['Chat ID'] || 'unknown';
    if (!studentMap[chatId]) studentMap[chatId] = { total: 0, lowConf: 0, pushback: 0 };
    studentMap[chatId].total++;
    if ((r.fields['Confidence'] || '').toLowerCase() === 'low') studentMap[chatId].lowConf++;
    if (r.fields['Status'] === 'negative_feedback') studentMap[chatId].pushback++;
  }
  const topFrictionStudents = Object.entries(studentMap)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].lowConf + b[1].pushback) - (a[1].lowConf + a[1].pushback))
    .slice(0, 10)
    .map(([chatId, v]) => ({
      chatId,
      total: v.total,
      frictionCount: v.lowConf + v.pushback,
      frictionRate: +((v.lowConf + v.pushback) / v.total * 100).toFixed(1),
    }));

  function arrow(curr: number, prior: number, higherIsBetter = true): 'up' | 'down' | 'same' {
    if (Math.abs(curr - prior) < 0.1) return 'same';
    const better = curr > prior ? higherIsBetter : !higherIsBetter;
    return curr > prior ? (better ? 'up' : 'down') : (better ? 'up' : 'down');
  }

  return NextResponse.json({
    generatedAt: now.toISOString(),
    headline: {
      activeStudents:  { curr: activeStudentsCurr,              prior: activeStudentsPrior,         trend: arrow(activeStudentsCurr, activeStudentsPrior) },
      totalQuestions:  { curr: curr.total,                       prior: prior.total,                  trend: arrow(curr.total, prior.total) },
      lowConfRate:     { curr: curr.lowConfRate,                 prior: prior.lowConfRate,             trend: arrow(curr.lowConfRate, prior.lowConfRate, false) },
      pushbackRate:    { curr: curr.pushbackRate,                prior: prior.pushbackRate,            trend: arrow(curr.pushbackRate, prior.pushbackRate, false) },
      followupRate:    { curr: +followupRateCurr.toFixed(1),     prior: +followupRatePrior.toFixed(1), trend: arrow(followupRateCurr, followupRatePrior, false) },
      avgLatencyMs:    { curr: avgLatency,                       prior: null,                          trend: 'same' },
      avgResponseTime: { curr: curr.avgTime,                     prior: prior.avgTime,                 trend: arrow(curr.avgTime, prior.avgTime, false) },
    },
    topicFriction,
    dailyVolume,
    versionComparison,
    topFrictionStudents,
  });
}
