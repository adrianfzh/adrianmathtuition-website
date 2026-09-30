// /app/science/marking/[id]/explain/[q] — the one-minute explanation under the
// Science family (the shell reads the family from the path); the same page as
// /app/marking/[id]/explain/[q], which redirects a science run here.
import ExplainPage from '../../../../../marking/[id]/explain/[q]/page';

export const dynamic = 'force-dynamic';

export default function ScienceExplainPage(props: { params: Promise<{ id: string; q: string }> }) {
  return <ExplainPage {...props} under="science" />;
}
