'use client';
import { use } from 'react';
import SharedBoard from '@/components/SharedBoard';

export default function StudentBoard({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return <SharedBoard linkKey={key} />;
}
