// Where the question bank's generated files go (5 Sep 2026): paper PDFs,
// solutions PDFs, custom worksheets and the paper ZIPs from /api/admin/questions.
//
// They used to go to Vercel Blob, whose store sits in the US: after the
// functions moved to Singapore the UPLOAD of a 2.5MB paper PDF became the
// longest stage of "Print this paper" (3.4–4.5s of a 5–6s warm build, measured
// with the route's own timings). The public `practice_worksheets` bucket lives
// in the same Singapore Supabase project as the database, so the upload is a
// short hop. These files are bank content — questions, answers, worked
// solutions — never a student's own work; student files have their own private
// bucket (lib/student-files.ts).
//
// Blob stays as the fallback so a Storage hiccup degrades to the old path
// instead of failing the build. Old cache rows keep their Blob URLs and stay
// valid.
import { put } from '@vercel/blob';
import { getSupabaseAdmin } from './supabase';

export const BANK_PDF_BUCKET = 'practice_worksheets';

function publicUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${BANK_PDF_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Store a generated bank file; returns its public URL. `key` like `paper-pdfs/<ts>.pdf`. */
export async function storeBankFile(key: string, bytes: Buffer, contentType: string): Promise<{ url: string; store: 'supabase' | 'blob' }> {
  try {
    const { error } = await getSupabaseAdmin().storage.from(BANK_PDF_BUCKET).upload(key, bytes, { contentType, upsert: true });
    if (error) throw new Error(error.message);
    return { url: publicUrl(key), store: 'supabase' };
  } catch (e) {
    console.warn('[bank-pdf-store] supabase upload failed, falling back to Blob:', (e as Error).message);
    const blob = await put(`mark-paper/${key}`, bytes, { access: 'public', contentType, token: process.env.BLOB_READ_WRITE_TOKEN });
    return { url: blob.url, store: 'blob' };
  }
}
