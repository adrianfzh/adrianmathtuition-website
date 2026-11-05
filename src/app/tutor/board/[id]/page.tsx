'use client';
// 🧑‍🏫 The tutor's side of a shared board (SPEC-TUTOR-TOOLS §8). The tutor layout keeps it noindex.
import { use } from 'react';
import SharedBoard from '@/components/SharedBoard';

export default function TutorBoard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SharedBoard boardId={id} back={{ href: '/tutor', label: 'Back to your students' }} />;
}
