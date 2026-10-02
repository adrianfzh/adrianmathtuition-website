// /app/science/my-notes — the Science family's My Notebook (1 Oct 2026): the
// SAME page as /app/my-notes rendered under the Science family, so the shell's
// Math | Science switcher and the science bottom menu stay put. Physics /
// Chemistry / Biology mistakes live here; the maths ones stay on /app/my-notes.
import MyNotebookPage from '../../my-notes/page';

export const dynamic = 'force-dynamic';

export default function ScienceNotebookPage(props: { searchParams: Promise<{ earlier?: string }> }) {
  return <MyNotebookPage {...props} family="science" />;
}
