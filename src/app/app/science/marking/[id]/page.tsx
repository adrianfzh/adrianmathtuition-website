// /app/science/marking/[id] — a science paper's page: the SAME page as
// /app/marking/[id], rendered under the Science family so the shell's
// Math | Science switcher and the science bottom menu stay put (25 Sep 2026,
// Adrian: "somehow it switched back to math tab while at science papers" —
// the shell reads the family from the path). A maths run here redirects back
// to /app/marking/<id>, and a science run there redirects here.
import PaperPage from '../../../marking/[id]/page';

export const dynamic = 'force-dynamic';

export default function SciencePaperPage(props: { params: Promise<{ id: string }> }) {
  return <PaperPage {...props} under="science" />;
}
