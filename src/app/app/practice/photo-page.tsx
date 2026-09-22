// 📷 The Practice tab's photo page (SPEC-PRACTICE-PHOTO.md, 23 Sep 2026).
//
// The camera sits above the to-do list: a student photographs a question (or
// types one), the bot files it under ONE sub-skill, this side picks a bank
// seed under that sub-skill and queues a re-skin; a "Writing…" row appears on
// the list at once and flips to "To do" when the worker is done. Behind
// PRACTICE_PHOTO_OPEN_TO_STUDENTS (lib/portal-beta practicePhotoOpen) until
// Adrian has read the first 20 on /admin/generated.
import type { PortalAccount } from '@/lib/portal-auth';
import { findLevelOptions } from '@/lib/portal-find';
import PhotoClient from './photo-client';

export default function PracticePhotoPage({ account }: { account: Pick<PortalAccount, 'level' | 'subjects'> }) {
  const levels = findLevelOptions(account);
  if (!levels.length) return null;
  return <PhotoClient levels={levels} />;
}
