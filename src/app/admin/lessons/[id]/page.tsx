import { Suspense } from 'react';
import LessonEditorClient from './LessonEditorClient';

export default function LessonEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>}>
      <LessonEditorClient />
    </Suspense>
  );
}
