// Only our own file store may be fetched server-side and re-served or attached — an
// unchecked URL parameter would turn the download/send routes into an authenticated
// open proxy. Every marked PDF and annotated page lives on *.public.blob.vercel-storage.com.
export function isOurBlobUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch { return false; }
}
