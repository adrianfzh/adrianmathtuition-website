# Cards Editor — Inline "+ New sub-group" — Build Briefing

> Small follow-up to `EDIT_CARDS_BRIEFING.md`. ~45 min of work. Adds an inline "+ New sub-group" form to both places in the cards editor where a sub-group is picked, so Adrian can create a sub-group on the fly without leaving the page.

## Why this matters

The cards editor today lets Adrian pick from existing sub-groups but offers no way to create a new one inline. Right now if he wants to author cards for a sub-skill that's not yet in the `subgroups` table, he has to drop into SQL or use the worksheet composer's Save-to-Bank modal (which has the same inline form already — task #138). This brings the same pattern into the cards editor.

**Sub-groups are shared across QB, KB, and content_snippets.** Creating a sub-group here writes one row to the `subgroups` table that's instantly visible to all three systems — labelling future questions, linking future KB entries, organising future cards.

## What you're building

Two surfaces in the cards editor get an inline new-sub-group form:

1. **New card modal** at `/admin/edit-cards` — the modal in `EditCardsClient.tsx`'s `NewCardModal` component. Sub-group `<select>` gets a `+ New sub-group` option; picking it expands an inline form below.

2. **Editor page** at `/admin/edit-cards/[id]` — the sub-group switcher in `EditorClient.tsx`'s `EditorPanel` component (around line 374, `sgId` state). Same `+ New sub-group` option in that dropdown so Adrian can reassign a card to a brand-new sub-group from the editor.

In both places, after creating the sub-group, it should:
- Be added to the local `subgroups` array (no full page reload needed)
- Be auto-selected
- Persist immediately to Supabase

## Files to touch

```
adrianmathtuition-website/
├── src/app/api/admin/cards/subgroups/create/route.ts   ← NEW: POST endpoint
└── src/app/admin/edit-cards/
    ├── EditCardsClient.tsx                              ← modify NewCardModal
    └── [id]/EditorClient.tsx                            ← modify EditorPanel's sub-group <select>
```

No DB migration. The `subgroups` table already exists with the right columns.

## 1. The endpoint

**File:** `src/app/api/admin/cards/subgroups/create/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, name, description } = await req.json();
  if (!level || !topic || !name) {
    return NextResponse.json(
      { error: 'level, topic, name required' },
      { status: 400 }
    );
  }

  // Normalise inputs
  const trimmedName = String(name).trim();
  const trimmedDesc = description ? String(description).trim() : null;
  if (!trimmedName) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Reject duplicate (same level + topic + name)
  const { data: dup } = await supa
    .from('subgroups')
    .select('id, name')
    .eq('level', level)
    .eq('topic', topic)
    .eq('name', trimmedName)
    .maybeSingle();

  if (dup) {
    return NextResponse.json(
      { error: `Sub-group "${trimmedName}" already exists for ${level}/${topic} (id ${dup.id})` },
      { status: 409 }
    );
  }

  const { data, error } = await supa
    .from('subgroups')
    .insert({
      level,
      topic,
      name: trimmedName,
      description: trimmedDesc,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
```

**Schema reminder:** the `subgroups` table columns used here are `level` (text), `topic` (text), `name` (text), `description` (text nullable). If there are additional columns (e.g. `source`, `created_at`), let Supabase defaults handle them.

## 2. NewCardModal — add the inline form

**File:** `src/app/admin/edit-cards/EditCardsClient.tsx`

Modify `NewCardModal` (currently around line 181) so the `<select>` includes a sentinel `+ New sub-group` option, and selecting it expands an inline form.

Replace the entire `NewCardModal` body with this shape:

```tsx
function NewCardModal({ subgroups: initialSubgroups, level, topic, onClose, onCreated, auth }: {
  subgroups: Subgroup[]; level: string; topic: string;
  onClose: () => void; onCreated: (id: string) => void; auth: string;
}) {
  const [subgroups, setSubgroups] = useState<Subgroup[]>(initialSubgroups);
  const [sgId, setSgId] = useState<number | '__new__'>(initialSubgroups[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  // New-subgroup inline form state
  const [newSgName, setNewSgName] = useState('');
  const [newSgDesc, setNewSgDesc] = useState('');
  const [creatingSg, setCreatingSg] = useState(false);
  const [sgErr, setSgErr] = useState('');

  async function createNewSubgroup() {
    if (!newSgName.trim()) { setSgErr('Name is required'); return; }
    setCreatingSg(true); setSgErr('');
    try {
      const res = await fetch('/api/admin/cards/subgroups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, name: newSgName.trim(), description: newSgDesc.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to create sub-group');
      // Insert new sub-group into local list and select it
      setSubgroups(prev => [...prev, json].sort((a, b) => a.id - b.id));
      setSgId(json.id);
      setNewSgName(''); setNewSgDesc('');
    } catch (e: unknown) {
      setSgErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCreatingSg(false);
    }
  }

  async function create() {
    if (typeof sgId !== 'number' || !sgId) {
      setErr(sgId === '__new__' ? 'Save the new sub-group first' : 'Pick a sub-group');
      return;
    }
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/admin/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, subgroup_id: sgId, card_title: title }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onCreated(json.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setCreating(false);
    }
  }

  const isNewSg = sgId === '__new__';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">New card</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sub-group</label>
            <select
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={sgId}
              onChange={(e) => {
                const v = e.target.value;
                setSgId(v === '__new__' ? '__new__' : Number(v));
              }}
            >
              {subgroups.map((sg) => (
                <option key={sg.id} value={sg.id}>{sg.name} (sg{sg.id})</option>
              ))}
              <option value="__new__">+ New sub-group…</option>
            </select>
          </div>

          {isNewSg && (
            <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sub-group name <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  placeholder="e.g. Simplifying nested surds"
                  value={newSgName}
                  onChange={(e) => setNewSgName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description <span className="text-slate-400">(optional, helps AI)</span></label>
                <textarea
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="What kind of question falls under this sub-skill?"
                  value={newSgDesc}
                  onChange={(e) => setNewSgDesc(e.target.value)}
                />
              </div>
              {sgErr && <p className="text-red-600 text-xs">{sgErr}</p>}
              <div className="flex gap-2">
                <button
                  onClick={createNewSubgroup}
                  disabled={creatingSg}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingSg ? 'Saving…' : 'Save sub-group'}
                </button>
                <button
                  onClick={() => { setSgId(subgroups[0]?.id ?? 0); setNewSgName(''); setNewSgDesc(''); setSgErr(''); }}
                  className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-white"
                >
                  Cancel
                </button>
                <p className="text-xs text-slate-500 self-center ml-auto">
                  for {level} · {topic}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Card title <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              placeholder="e.g. Simplify √72"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isNewSg) create(); }}
            />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={create} disabled={creating || isNewSg} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create card'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Key UX rules:**
- The "+ New sub-group…" option is always the LAST option in the select
- When selected, the create-card button disables (`disabled={creating || isNewSg}`) until the sub-group is saved
- Once saved, the new sub-group auto-selects and the inline form clears
- Cancel button on the inline form reverts the select to the first existing sub-group without making any backend call
- Duplicate name within same (level, topic) returns 409 — show that error in the inline form

## 3. EditorClient — same pattern in the sub-group switcher

**File:** `src/app/admin/edit-cards/[id]/EditorClient.tsx`

Around line 374, where `sgId` state lives, the editor has a sub-group `<select>` for moving a card between sub-groups. Apply the same pattern:

1. Add `'__new__'` as a possible sentinel value
2. When selected, show the inline name + description form below the select (same JSX as the modal)
3. On save → POST to `/api/admin/cards/subgroups/create`, append to local subgroups list, auto-select
4. **Important:** the auto-save mechanism should NOT fire a card-PATCH with `subgroup_id='__new__'` — guard the `scheduleSave` call with `typeof sgId === 'number'`, so a card stays parked on its original sub-group until the new one is saved

You can copy the inline-form JSX block from the modal directly — it's identical UI. Lift it into a small shared `<NewSubgroupInline />` component if you want, or inline both copies — your call. Inline is fine for a 45-min change.

## 4. Acceptance criteria

Verify before declaring done:

1. Open `/admin/edit-cards` → pick AM → Surds → click "+ New card".
2. In the modal, click the sub-group dropdown → see "+ New sub-group…" at the bottom.
3. Select "+ New sub-group…" → form appears with Name + Description fields.
4. Type a name like "Test Sub-group" → click Save sub-group. New sub-group appears in dropdown as selected, form clears.
5. Type card title → click Create card. Card creates successfully, lands on `/admin/edit-cards/[new-id]` editor.
6. Verify in Supabase: `SELECT * FROM subgroups WHERE name = 'Test Sub-group';` returns one row with the right level + topic.
7. Refresh the list page. The new sub-group appears in the sidebar with the new card under it.
8. Try to create another sub-group with the same name in the same level+topic → see 409 "already exists" error.
9. From the editor page (any card), open the sub-group switcher → "+ New sub-group…" works the same way.
10. Cancel the inline form → select reverts to a real sub-group, no DB write occurred.
11. Delete the test sub-group via SQL afterwards: `DELETE FROM subgroups WHERE name = 'Test Sub-group';` (or leave it if you want — it's just a test).

## 5. Out of scope

- Editing or deleting existing sub-groups from this UI (separate feature — not needed for v1)
- Cross-topic sub-group creation (the form locks to the current level+topic context, which is correct)
- Bulk sub-group import (separate flow)
- Reassigning existing questions to the new sub-group (handled elsewhere via the labelling pipeline)

## 6. When you're done

1. Commit + push to main.
2. Tell Adrian: "+ New sub-group inline form live in cards editor. Try it on AM → Surds → + New card → + New sub-group…"
3. Update `CLAUDE.md` if needed — the new API route `admin/cards/subgroups/create` belongs under the Cards editor API routes list.

That's it. Small change, immediate quality-of-life win.
