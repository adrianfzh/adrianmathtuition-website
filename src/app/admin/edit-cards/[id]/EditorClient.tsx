'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Card {
  id: string;
  level: string;
  topic: string;
  subgroup_id: number;
  display_group: string | null;
  content_kind: string;
  order_index: number;
  card_title: string;
  content: string;
  is_published: boolean;
  source_kb_entry_id: string | null;
}

interface Subgroup {
  id: number;
  name: string;
  description: string;
}

interface Props {
  card: Card;
  subgroups: Subgroup[];
  siblings: { id: string; order_index: number; card_title: string }[];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── Cookie helper ─────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// ── KaTeX config (same as SwipeApp) ──────────────────────────────────────────

const katexOptions = {
  strict: false,
  trust: true,
  throwOnError: false,
  output: 'htmlAndMathml' as const,
  macros: { '\\tfrac': '\\frac' },
};

function fixMathFences(src: string): string {
  return src
    .replace(/\$\$(?=\S)/g, () => '$$\n')
    .replace(/([^\n\s])\$\$/g, (_, c: string) => `${c}\n$$`);
}

// ── Simple line diff ──────────────────────────────────────────────────────────

interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
}

function computeDiff(original: string, updated: string): DiffLine[] {
  const aLines = original.split('\n');
  const bLines = updated.split('\n');
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = aLines.length;
  const n = bLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && aLines[i] === bLines[j]) {
      result.push({ type: 'same', text: aLines[i] });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'add', text: bLines[j] });
      j++;
    } else {
      result.push({ type: 'remove', text: aLines[i] });
      i++;
    }
  }
  return result;
}

// ── AI Quick actions ──────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Make clearer', instruction: 'Rewrite for clarity. Same content, same answer, but cleaner phrasing and tighter step transitions.' },
  { label: 'Shorten ~30%', instruction: 'Shorten by roughly 30%. Drop filler, keep every algebra step, keep the worked answer.' },
  { label: 'Add pitfall note', instruction: "At the end, add a brief 'Common pitfall:' line warning about the most likely student error in this kind of question." },
  { label: 'Add common-mistake', instruction: "Add a short '⚠ Watch out:' aside near the relevant step where students typically slip up." },
  { label: 'Add a sanity check', instruction: "Add a short final 'Check:' step that substitutes the answer back / verifies dimensions / spot-checks the result." },
  { label: 'Tighten algebra', instruction: 'Tighten the algebra steps — combine micro-steps that students can do in one line, but keep enough scaffolding that the logic is followable.' },
  { label: 'Use a fresh example', instruction: "Same sub-skill, different numbers and surface. Don't reuse the same coefficients/values. Rewrite the whole card with a new example." },
  { label: 'Add a why-this-works', instruction: 'Add one sentence at the top explaining *why* this method works, before diving into steps.' },
];

// ── AI Sidebar ────────────────────────────────────────────────────────────────

function AISidebar({
  card,
  subgroup,
  content,
  title,
  auth,
  onAccept,
}: {
  card: Card;
  subgroup: Subgroup | undefined;
  content: string;
  title: string;
  auth: string;
  onAccept: (newContent: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [aiError, setAiError] = useState('');
  const [image, setImage] = useState<{ data: string; mediaType: string; previewUrl: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  function loadImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImage({ data: dataUrl.split(',')[1], mediaType: file.type, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  const runAI = useCallback(
    async (instruction: string) => {
      if (streaming) {
        abortRef.current?.();
        return;
      }
      setStreaming(true);
      setAiResult('');
      setDiffLines(null);
      setAiError('');
      let result = '';
      let aborted = false;

      const body = JSON.stringify({
        instruction,
        currentTitle: title,
        currentContent: content,
        level: card.level,
        topic: card.topic,
        subgroupName: subgroup?.name ?? '',
        subgroupDescription: subgroup?.description ?? '',
        content_kind: card.content_kind,
        imageData: image?.data,
        imageMediaType: image?.mediaType,
        password: auth,
      });

      const controller = new AbortController();
      abortRef.current = () => { aborted = true; controller.abort(); };

      try {
        const res = await fetch('/api/edit-cards-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done || aborted) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            const data = JSON.parse(part.slice(6));
            if (data.error) throw new Error(data.error);
            if (data.done) break;
            if (data.chunk) {
              result += data.chunk;
              setAiResult(result);
            }
          }
        }

        if (!aborted && result) {
          setDiffLines(computeDiff(content, result));
        }
      } catch (e: unknown) {
        if (!aborted) setAiError(e instanceof Error ? e.message : 'AI error');
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, title, content, card, subgroup, image, auth]
  );

  function handleAccept() {
    if (!aiResult) return;
    onAccept(aiResult);
    setDiffLines(null);
    setAiResult('');
    setPrompt('');
    setImage(null);
  }

  function handleReject() {
    setDiffLines(null);
    setAiResult('');
    setPrompt('');
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 shrink-0">
        <span className="text-sm font-semibold text-slate-800">✨ AI assist</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {/* Quick actions — 2-column grid */}
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Quick actions</p>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.label}
                onClick={() => runAI(qa.instruction)}
                disabled={streaming}
                className="text-left text-sm px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 leading-tight"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* Free-form prompt + image */}
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Or describe a change:</p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadImage(f); }}
          >
            <textarea
              className={`w-full border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300'}`}
              rows={4}
              placeholder={image ? 'Optional: add instructions for the image…' : 'e.g. Split into two cards… drop or paste an image here'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={streaming}
              onPaste={(e) => {
                const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
                if (item) { const f = item.getAsFile(); if (f) { loadImage(f); e.preventDefault(); } }
              }}
            />
          </div>
          {image && (
            <div className="mt-2 flex items-center gap-2 p-2 border border-slate-200 rounded bg-slate-50">
              <img src={image.previewUrl} alt="uploaded" className="h-12 w-12 object-cover rounded border border-slate-200 shrink-0" />
              <span className="text-xs text-slate-500 flex-1 truncate">Image attached — AI will extract from it</span>
              <button onClick={() => setImage(null)} className="text-slate-400 hover:text-red-500 text-sm shrink-0">✕</button>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 shrink-0"
              title="Upload image"
            >📎</button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImage(f); e.target.value = ''; }} />
            <button
              onClick={() => runAI(prompt)}
              disabled={(!prompt.trim() && !image) || streaming}
              className="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              {streaming ? 'Streaming… (click to cancel)' : image ? 'Extract from image' : 'Send to AI'}
            </button>
          </div>
        </div>

        {/* Error */}
        {aiError && (
          <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{aiError}</p>
        )}

        {/* Streaming preview */}
        {streaming && aiResult && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Streaming…</p>
            <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-slate-600">
              {aiResult}
            </div>
          </div>
        )}

        {/* Diff preview — no max-h cap; fills remaining space */}
        {diffLines && !streaming && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Diff preview</p>
            <div className="text-xs font-mono border border-slate-200 rounded overflow-hidden overflow-y-auto">
              {diffLines.map((line, i) => (
                <div
                  key={i}
                  className={`px-2 py-0.5 whitespace-pre-wrap leading-relaxed ${
                    line.type === 'add'
                      ? 'bg-green-50 text-green-800'
                      : line.type === 'remove'
                      ? 'bg-red-50 text-red-700 line-through'
                      : 'text-slate-600'
                  }`}
                >
                  {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Accept/Reject — outside scroll area, always visible */}
      {diffLines && !streaming && (
        <div className="shrink-0 px-4 py-3 border-t border-slate-200 bg-white flex gap-2">
          <button
            onClick={handleAccept}
            className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            Accept
          </button>
          <button
            onClick={handleReject}
            className="flex-1 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteModal({
  onConfirm,
  onCancel,
  deleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Delete this card?</h2>
        <p className="text-sm text-slate-600 mb-6">This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export default function EditorClient({ card, subgroups: initialSubgroups, siblings }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw') || '';
  const auth = pw;

  const [title, setTitle] = useState(card.card_title);
  const [content, setContent] = useState(card.content);
  const [subgroups, setSubgroups] = useState<Subgroup[]>(initialSubgroups);
  const [sgId, setSgId] = useState<number | '__new__'>(card.subgroup_id);
  const [displayGroup, setDisplayGroup] = useState<string>(card.display_group ?? '');
  const [sections, setSections] = useState<string[]>([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [sectionIsNew, setSectionIsNew] = useState(false);
  const [orderIndex, setOrderIndex] = useState(card.order_index);
  const [isPublished, setIsPublished] = useState(card.is_published);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(true);

  // Inline "+ New sub-group" form state
  const [newSgName, setNewSgName] = useState('');
  const [newSgDesc, setNewSgDesc] = useState('');
  const [creatingSg, setCreatingSg] = useState(false);
  const [sgErr, setSgErr] = useState('');
  const lastValidSgId = useRef<number>(card.subgroup_id);
  useEffect(() => { if (typeof sgId === 'number') lastValidSgId.current = sgId; }, [sgId]);

  async function createNewSubgroup() {
    if (!newSgName.trim()) { setSgErr('Name is required'); return; }
    setCreatingSg(true); setSgErr('');
    try {
      const res = await fetch('/api/admin/cards/subgroups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level: card.level, topic: card.topic, name: newSgName.trim(), description: newSgDesc.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to create sub-group');
      const newSg: Subgroup = {
        id: json.id,
        name: json.name,
        description: json.description ?? '',
      };
      setSubgroups((prev) => [...prev, newSg].sort((a, b) => a.id - b.id));
      setSgId(newSg.id);
      setNewSgName(''); setNewSgDesc('');
    } catch (e: unknown) {
      setSgErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCreatingSg(false);
    }
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewContent, setPreviewContent] = useState(card.content);
  const isMobile = useWindowWidth() < 1024;
  const isNarrow = useWindowWidth() < 1280;

  useEffect(() => {
    if (!pw) { window.location.href = '/admin'; }
  }, [pw]);

  // Fetch section list for this card's (level, topic)
  useEffect(() => {
    if (!pw || !card.level || !card.topic) return;
    fetch(`/api/admin/cards/sections/list?level=${encodeURIComponent(card.level)}&topic=${encodeURIComponent(card.topic)}`, {
      headers: { Authorization: `Bearer ${pw}` },
    })
      .then((r) => r.json())
      .then((j) => {
        const names: string[] = (j.sections ?? []).map((s: { name: string }) => s.name);
        setSections(names);
        // Ensure current display_group is in the list
        if (card.display_group && !names.includes(card.display_group)) {
          setSections((prev) => [...prev, card.display_group!].sort());
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pw]);

  // Back URL
  const backParams = new URLSearchParams();
  if (card.level) backParams.set('level', card.level);
  if (card.topic) backParams.set('topic', card.topic);
  const backUrl = `/admin/edit-cards?${backParams.toString()}`;

  // Debounced preview update
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewContent(content), 200);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [content]);

  // Auto-save (debounced 800ms)
  const saveData = useCallback(
    async (fields: {
      card_title: string;
      content: string;
      subgroup_id: number;
      display_group: string;
      order_index: number;
      is_published: boolean;
    }) => {
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/admin/cards/${card.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify(fields),
        });
        if (!res.ok) throw new Error();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2500);
      } catch {
        setSaveStatus('error');
      }
    },
    [card.id, auth]
  );

  const scheduleSave = useCallback(() => {
    if (typeof sgId !== 'number') return; // Don't save while inline new-sub-group form is open
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const sgIdForSave = sgId;
    const dgForSave = sectionIsNew ? newSectionName.trim() : displayGroup;
    saveTimer.current = setTimeout(() => {
      saveData({ card_title: title, content, subgroup_id: sgIdForSave, display_group: dgForSave, order_index: orderIndex, is_published: isPublished });
    }, 800);
  }, [saveData, title, content, sgId, displayGroup, sectionIsNew, newSectionName, orderIndex, isPublished]);

  // Trigger auto-save on any field change
  useEffect(() => { scheduleSave(); }, [title, content, sgId, displayGroup, sectionIsNew, newSectionName, orderIndex, isPublished, scheduleSave]);

  // Cmd+S for immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (typeof sgId !== 'number') return; // Block save while inline new-sub-group form is open
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        const dgNow = sectionIsNew ? newSectionName.trim() : displayGroup;
        saveData({ card_title: title, content, subgroup_id: sgId, display_group: dgNow, order_index: orderIndex, is_published: isPublished });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveData, title, content, sgId, orderIndex, isPublished]);

  // Tab key in textarea inserts 2 spaces
  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
      setContent(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  // Prev / Next within sibling list
  const siblingIdx = siblings.findIndex((s) => s.id === card.id);
  const prevSibling = siblingIdx > 0 ? siblings[siblingIdx - 1] : null;
  const nextSibling = siblingIdx < siblings.length - 1 ? siblings[siblingIdx + 1] : null;

  function navigateTo(id: string) {
    const p = new URLSearchParams(searchParams.toString());
    router.push(`/admin/edit-cards/${id}?${p.toString()}`);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/cards/${card.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth}` },
      });
      if (!res.ok) throw new Error();
      router.push(backUrl);
    } catch {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  const currentSubgroup = subgroups.find((sg) => sg.id === sgId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4">
        <a href={backUrl} className="text-sm text-blue-600 hover:underline whitespace-nowrap">
          ← Back to {card.topic}
        </a>
        <div className="flex-1 min-w-0 text-sm text-slate-500 flex items-center gap-2 truncate">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${card.content_kind === 'refresher' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
            {card.content_kind === 'refresher' ? '🧠 Refresher' : '💡 Worked Example'}
          </span>
          <span className="truncate">sg{typeof sgId === 'number' ? sgId : lastValidSgId.current} · {currentSubgroup?.name ?? '…'} · Card {siblingIdx + 1} of {siblings.length}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveStatus === 'saving' && <span className="text-sm text-slate-400">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-sm text-green-600">Saved ✓</span>}
          {saveStatus === 'error' && <span className="text-sm text-red-600">Save failed</span>}
          <button
            onClick={() => {
              if (typeof sgId !== 'number') return;
              if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
              const dgNow2 = sectionIsNew ? newSectionName.trim() : displayGroup;
              saveData({ card_title: title, content, subgroup_id: sgId, display_group: dgNow2, order_index: orderIndex, is_published: isPublished });
            }}
            disabled={typeof sgId !== 'number'}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
          {!isMobile && isNarrow && (
            <button
              onClick={() => setAiSidebarOpen((v) => !v)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50"
            >
              {aiSidebarOpen ? 'Hide AI' : '✨ AI'}
            </button>
          )}
        </div>
      </div>

      {/* Mobile notice */}
      {isMobile && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800">
          Cards are easier to edit on desktop. You can still preview here but the textarea is read-only.
        </div>
      )}

      {/* Card meta row */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Card title</label>
          <input
            type="text"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Simplify √72"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Section</label>
            <select
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
              value={sectionIsNew ? '__new__' : displayGroup}
              onChange={(e) => {
                if (e.target.value === '__new__') { setSectionIsNew(true); }
                else { setSectionIsNew(false); setDisplayGroup(e.target.value); }
              }}
            >
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__new__">+ New section…</option>
            </select>
            {sectionIsNew && (
              <input
                type="text"
                className="border border-slate-300 rounded px-2 py-1.5 text-sm w-40"
                placeholder="Section name"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onBlur={() => {
                  if (!newSectionName.trim()) { setSectionIsNew(false); setDisplayGroup(sections[0] ?? ''); }
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Sub-group</label>
            <select
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
              value={sgId}
              onChange={(e) => {
                const v = e.target.value;
                setSgId(v === '__new__' ? '__new__' : Number(v));
              }}
            >
              {subgroups.map((sg) => (
                <option key={sg.id} value={sg.id}>
                  {sg.name} (sg{sg.id})
                </option>
              ))}
              <option value="__new__">+ New sub-group…</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Order</label>
            <input
              type="number"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-16"
              value={orderIndex}
              onChange={(e) => setOrderIndex(Number(e.target.value))}
              min={1}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-600">Published</span>
          </label>
          {card.source_kb_entry_id && (
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
              🔗 Linked to KB entry
            </span>
          )}
        </div>

        {sgId === '__new__' && (
          <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-2">
            <p className="text-xs text-slate-500">
              Creating a new sub-group under <span className="font-medium">{card.level} · {card.topic}</span>. Card stays on its current sub-group until you save.
            </p>
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
                onClick={() => { setSgId(lastValidSgId.current); setNewSgName(''); setNewSgDesc(''); setSgErr(''); }}
                className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor body */}
      <div className="flex-1 flex overflow-hidden">
        {isMobile ? (
          // Mobile: stacked, read-only textarea + preview
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Content (read-only on mobile)</label>
              <textarea
                readOnly
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-mono bg-slate-50 resize-none"
                rows={12}
                value={content}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Preview</label>
              <div className="border border-slate-200 rounded p-4 bg-white prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[[rehypeKatex, katexOptions]]}
                >
                  {fixMathFences(previewContent)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          // Desktop: textarea + preview + AI sidebar
          <div className="flex-1 flex min-h-0">
            {/* Textarea */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                Markdown + LaTeX
              </div>
              <textarea
                className="flex-1 resize-none px-4 py-3 text-sm font-mono focus:outline-none bg-white leading-relaxed"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                spellCheck={false}
              />
            </div>

            {/* Preview */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200 overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                Live preview
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 bg-white prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[[rehypeKatex, katexOptions]]}
                >
                  {fixMathFences(previewContent)}
                </ReactMarkdown>
              </div>
            </div>

            {/* AI sidebar */}
            {(!isNarrow || aiSidebarOpen) && (
              <div className="w-72 shrink-0 border-slate-200 bg-white overflow-hidden flex flex-col">
                <AISidebar
                  card={card}
                  subgroup={currentSubgroup}
                  content={content}
                  title={title}
                  auth={auth}
                  onAccept={(newContent) => setContent(newContent)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setShowDelete(true)}
          className="text-sm px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Delete card
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => prevSibling && navigateTo(prevSibling.id)}
            disabled={!prevSibling}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-30"
            title={prevSibling?.card_title ?? ''}
          >
            ← Prev
          </button>
          <button
            onClick={() => nextSibling && navigateTo(nextSibling.id)}
            disabled={!nextSibling}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-30"
            title={nextSibling?.card_title ?? ''}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Delete modal */}
      {showDelete && (
        <DeleteModal
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          deleting={deleting}
        />
      )}
    </div>
  );
}

// ── Window width hook ─────────────────────────────────────────────────────────

function useWindowWidth(): number {
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}
