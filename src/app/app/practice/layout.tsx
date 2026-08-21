// Marking-only beta gate for /app/practice (lib/portal-beta.ts). The page itself is
// a client component, so the server-side redirect lives in this layout:
// students bounce to /app, Adrian's admin cookie passes.
import { requireFullPortal } from '@/lib/portal-beta';

export default async function Gate({ children }: { children: React.ReactNode }) {
  await requireFullPortal();
  return <>{children}</>;
}
