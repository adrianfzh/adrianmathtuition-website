'use client';
// The one-minute explanation with its voice (1 Oct 2026). Renders the player
// at once, silent (the ▶ Auto timers pace it), asks /api/portal/explain/voice
// for the beats' clips once, and when they arrive hands the SAME player new
// scenes with `beats[k].audio` set (lib/explain-voice attachVoice) — its
// `hasVoice` is a useMemo over `scenes`, so the 🔊 pill appears without a
// remount and playback carries on where it was. A failed or slow request
// changes nothing: the explanation stays the silent one.
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import LessonPlayer from '../../../../lesson/[slug]/lesson-player';
import { attachVoice } from '@/lib/explain-voice';
import { fileHref } from '@/lib/student-files-url';

type PlayerProps = ComponentProps<typeof LessonPlayer>;

export default function ExplainPlayer({ runId, q, scenes, ...rest }: PlayerProps & { runId: string; q: string }) {
  const [urls, setUrls] = useState<(string | null)[] | null>(null);

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    fetch('/api/portal/explain/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, q }),
      signal: ctrl.signal,
    })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { urls?: (string | null)[] } | null) => {
        if (!live || !j || !Array.isArray(j.urls)) return;
        // Same-origin paths so the session cookie rides along on the preview deploy too.
        const mapped = j.urls.map(u => (u ? fileHref(u) : null));
        if (mapped.some(Boolean)) setUrls(mapped);
      })
      .catch(() => { /* silent explanation */ });
    return () => { live = false; ctrl.abort(); };
  }, [runId, q]);

  const voiced = useMemo(() => (urls ? attachVoice(scenes, urls) : scenes), [scenes, urls]);

  return <LessonPlayer scenes={voiced} {...rest} />;
}
