import DigestsClient from './DigestsClient';

export const metadata = {
  title: 'Parent Digests — Admin',
};

export default function DigestsPage() {
  return (
    <>
      <a
        href="/admin"
        style={{ position: 'fixed', top: 10, left: 10, zIndex: 50, color: '#64748b', textDecoration: 'none', fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.9)', padding: '4px 10px', borderRadius: 8 }}
      >
        ‹ Admin
      </a>
      <DigestsClient />
    </>
  );
}
