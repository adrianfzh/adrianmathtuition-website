'use client';

// Full-screen overlay that embeds a real (third-party) calculator emulator via
// iframe, with fallback "open in new tab" links in case a given emulator changes
// or blocks framing. Used for the TI-84 (which allows embedding).
export default function RealEmulator({ title, url, alts, onClose }: {
  title: string;
  url: string;
  alts: { label: string; url: string }[];
  onClose: () => void;
}) {
  return (
    <div className="remu">
      <div className="remu-bar">
        <button className="remu-close" onClick={onClose}>‹ Back</button>
        <span className="remu-title">{title}</span>
        <div className="remu-links">
          <span className="remu-note">3rd-party · </span>
          {alts.map((a) => <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer">{a.label} ↗</a>)}
        </div>
      </div>
      <iframe src={url} title={title} allow="fullscreen; clipboard-write" />
      <style jsx>{`
        .remu { position: fixed; inset: 0; z-index: 70; background: #0e0f10; display: flex; flex-direction: column; }
        .remu-bar { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #1a1f26; color: #fff; font-family: 'Helvetica Neue',Arial,sans-serif; flex-wrap: wrap; }
        .remu-close { background: rgba(255,255,255,.18); border: none; color: #fff; padding: 7px 12px; border-radius: 999px; font-weight: 600; font-size: 13px; cursor: pointer; }
        .remu-title { font-weight: 700; font-size: 13px; }
        .remu-links { display: flex; align-items: center; gap: 10px; margin-left: auto; }
        .remu-note { color: #8a93a0; font-size: 11px; }
        .remu-links a { color: #7fb6e8; font-size: 12px; text-decoration: none; }
        iframe { flex: 1; width: 100%; border: none; background: #fff; }
      `}</style>
    </div>
  );
}
