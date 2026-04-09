'use client';

import { Suspense, use, useEffect, useState } from 'react';
import LessonPlayer from '@/components/LessonPlayer';

// URL: /revise/[topic]/[subtopic]/[subsubtopic]/lesson
// Maps to slug: {topic}/{subtopic}/{subsubtopic}
// e.g. /revise/em/algebra/subject-of-formula/lesson → slug "em/algebra/subject-of-formula"

interface PageParams {
  topic: string;
  subtopic: string;
  subsubtopic: string;
}

function LessonLoader({ params }: { params: Promise<PageParams> }) {
  const { topic, subtopic, subsubtopic } = use(params);
  const slug = `${topic}/${subtopic}/${subsubtopic}`;

  const [lessonData, setLessonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/revision?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(json => {
        if (json.lessonData) {
          setLessonData(json.lessonData);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        background: 'var(--color-background)',
        fontFamily: 'var(--font-sans)',
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-amber)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--color-muted-foreground)', fontSize: 15 }}>Loading lesson…</p>
      </div>
    );
  }

  if (notFound || !lessonData) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        padding: '0 24px',
        background: 'var(--color-background)',
        fontFamily: 'var(--font-sans)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40 }}>📚</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)', fontSize: 22, margin: 0 }}>
          No lesson available yet
        </h2>
        <p style={{ color: 'var(--color-muted-foreground)', fontSize: 15, maxWidth: 320, margin: 0 }}>
          No revision lesson is available for this topic yet. Check back soon!
        </p>
        <a
          href={`/revise?level=${topic}`}
          style={{
            marginTop: 8,
            padding: '10px 20px',
            background: 'var(--color-navy)',
            color: 'white',
            borderRadius: 10,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ← Back to Revision
        </a>
      </div>
    );
  }

  return <LessonPlayer lessonData={lessonData} />;
}

export default function LessonPage({ params }: { params: Promise<PageParams> }) {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background)',
      }} />
    }>
      <LessonLoader params={params} />
    </Suspense>
  );
}
