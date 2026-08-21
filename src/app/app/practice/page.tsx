// /app/practice — the full-page practice flow (Adrian's admin view / full
// portal). The same component is embedded on the student Home during the
// marking-only beta (app/page.tsx), so the flow itself lives in practice-flow.tsx.
import PracticeFlow from './practice-flow';

export default function PracticePage() {
  return <PracticeFlow />;
}
