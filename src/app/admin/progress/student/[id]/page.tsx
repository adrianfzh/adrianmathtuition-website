'use client';

// The per-student progress view has been merged into the unified student hub at
// /admin/students/[id] (Overview tab). This route now just redirects there so old
// links keep working.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ProgressStudentRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) || '';
  useEffect(() => {
    router.replace(id ? `/admin/students/${id}` : '/admin/students');
  }, [id, router]);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontFamily: 'system-ui' }}>
      Redirecting to the student page…
    </div>
  );
}
