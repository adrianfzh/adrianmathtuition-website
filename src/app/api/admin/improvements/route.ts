import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BASE    = process.env.AIRTABLE_BASE_ID!;
const TOKEN   = process.env.AIRTABLE_TOKEN!;
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

function checkAuth(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

async function atAll(table: string, qs = ''): Promise<any[]> {
  const records: any[] = [];
  let offset: string | null = null;
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?pageSize=100${qs ? '&' + qs : ''}${offset ? '&offset=' + encodeURIComponent(offset) : ''}`;
    const r = await fetch(url, { headers: HEADERS });
    const data: any = await r.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);
  return records;
}

// GET — batches, topic rates, trend
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get('days') || '14', 10);
  const since14 = new Date(Date.now() - days * 86400_000).toISOString();
  const since30  = new Date(Date.now() - 30  * 86400_000).toISOString();

  // Pending batches
  const batchRecords = await atAll('SynthesisBatches', `filterByFormula=${encodeURIComponent("{Status}!='complete'")}`);
  const batches = batchRecords
    .sort((a, b) => ((b.fields['Batch ID'] || '') > (a.fields['Batch ID'] || '') ? 1 : -1))
    .map(r => {
      try {
        const parsed = JSON.parse(r.fields['Clusters JSON'] || '{}');
        return {
          batchId: r.fields['Batch ID'] as string,
          status:  r.fields['Status']   as string,
          clusters: (parsed.clusters || []).map((c: any, i: number) => ({
            ...c,
            recordIds: (parsed.recordsByCluster || [])[i] || [],
          })),
        };
      } catch { return null; }
    })
    .filter(Boolean);

  // Topic error rates
  const [sugs, qs, sugs30] = await Promise.all([
    atAll('Suggestions', `filterByFormula=${encodeURIComponent(`IS_AFTER({Created At},'${since14}')`)}`),
    atAll('Questions',   `filterByFormula=${encodeURIComponent(`IS_AFTER({Timestamp},'${since14}')`)}`),
    atAll('Suggestions', `filterByFormula=${encodeURIComponent(`IS_AFTER({Created At},'${since30}')`)}`),
  ]);

  const sugByTopic: Record<string, number> = {};
  sugs.forEach(s => { const t = s.fields['Topic'] || 'unknown'; sugByTopic[t] = (sugByTopic[t] || 0) + 1; });
  const qByTopic: Record<string, number> = {};
  qs.forEach(q => { const t = q.fields['Topic'] || 'unknown'; qByTopic[t] = (qByTopic[t] || 0) + 1; });

  const allTopics = new Set([...Object.keys(sugByTopic), ...Object.keys(qByTopic)]);
  const topicRates = Array.from(allTopics)
    .map(t => ({ topic: t, sugs: sugByTopic[t] || 0, qs: qByTopic[t] || 0, rate: qByTopic[t] ? (sugByTopic[t] || 0) / qByTopic[t] : 0 }))
    .filter(r => r.qs > 0 || r.sugs > 0)
    .sort((a, b) => b.rate - a.rate || b.sugs - a.sugs)
    .slice(0, 25);

  // 30-day volume trend
  const trendByDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    trendByDay[d] = 0;
  }
  sugs30.forEach(s => {
    const day = ((s.fields['Created At'] || '') as string).slice(0, 10);
    if (day in trendByDay) trendByDay[day]++;
  });
  const trend = Object.entries(trendByDay).map(([date, count]) => ({ date, count }));

  return NextResponse.json({ batches, topicRates, trend });
}

// POST — approve or reject a cluster
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { batchId, clusterIdx, action, reason } = await req.json();

  // Fetch the batch record
  const batchRecs = await atAll('SynthesisBatches', `filterByFormula=${encodeURIComponent(`{Batch ID}='${batchId}'`)}`);
  const batchRec = batchRecs[0];
  if (!batchRec) return NextResponse.json({ error: 'batch not found' }, { status: 404 });

  const parsed = JSON.parse(batchRec.fields['Clusters JSON'] || '{}');
  const cluster   = (parsed.clusters || [])[clusterIdx];
  const recordIds = (parsed.recordsByCluster || [])[clusterIdx] || [];
  if (!cluster) return NextResponse.json({ error: 'cluster not found' }, { status: 404 });

  // Update suggestions
  const newStatus = action === 'approve' ? 'applied' : 'rejected';
  const sugFields: any = { Status: newStatus };
  if (action === 'reject' && reason) sugFields['Rejection Reason'] = reason;

  for (let i = 0; i < recordIds.length; i += 10) {
    const chunk = (recordIds as string[]).slice(i, i + 10);
    await fetch(`https://api.airtable.com/v0/${BASE}/Suggestions`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ records: chunk.map(id => ({ id, fields: sugFields })) }),
    });
  }

  // Check if all clusters in this batch are now actioned
  const remainingClusters = (parsed.clusters || []).filter((_: any, i: number) => i !== clusterIdx);
  const allActioned = remainingClusters.length === 0;
  await fetch(`https://api.airtable.com/v0/${BASE}/SynthesisBatches/${batchRec.id}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: { Status: allActioned ? 'complete' : 'partial_review' } }),
  });

  // Append rule to prompt_additions.txt via bot's internal endpoint
  if (action === 'approve') {
    const botUrl  = process.env.BOT_BASE_URL;
    const botSecret = process.env.BOT_INTERNAL_SECRET;
    if (botUrl && botSecret) {
      try {
        const r = await fetch(`${botUrl}/api/append-rule`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, rule: cluster.proposed_rule, theme: cluster.theme }),
        });
        if (!r.ok) console.error('[improvements] append-rule failed:', await r.text());
      } catch (err: any) {
        console.error('[improvements] append-rule error:', err.message);
      }
    } else {
      console.warn('[improvements] BOT_BASE_URL or BOT_INTERNAL_SECRET not set — rule not appended');
    }
  }

  return NextResponse.json({ ok: true });
}
