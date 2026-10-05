// /app/suggestions — 💡 Suggestions (5 Oct 2026, Adrian: "a suggestion button … students
// can suggest what they need for their exams, if reasonable and helpful - i will try to
// add it"). One box, "Stay anonymous", Submit, then a short thank-you. The rows on
// Home and in Settings link here. Behind SUGGESTIONS_OPEN_TO_STUDENTS (lib/portal-beta):
// a student who types the address early lands back on Home.
import { redirect } from 'next/navigation';
import { suggestionsOpen } from '@/lib/portal-beta';
import SuggestionForm from './suggestion-form';

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage() {
  if (!(await suggestionsOpen())) redirect('/app');
  return (
    <div className="space-y-4 pb-24 sm:pb-6 max-w-xl">
      <h1 className="text-2xl font-bold text-navy pt-1 tracking-tight">💡 Suggestions</h1>
      <SuggestionForm />
    </div>
  );
}
