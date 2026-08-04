import { ImageResponse } from 'next/og';

// Link-preview card image (1200x630) for WhatsApp / Telegram / iMessage / Slack / Facebook.
// Public and unauthenticated on purpose — the crawlers that fetch it are anonymous.
//
// Usage: /api/og?title=Linear+Law&sub=Watch+a+curve+straighten&tag=Interactive+tool
// Static pages under public/tools/*.html point their og:image here too, which is why
// this lives in the app rather than as a committed PNG per tool.

export const contentType = 'image/png';

const NAVY = '#142952';
const AMBER = '#F4C025';
const CREAM = '#FFF8E7';
const MUTED = '#A9B4CC';

function clamp(v: string | null, max: number, fallback = ''): string {
  const s = (v ?? '').trim() || fallback;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const title = clamp(searchParams.get('title'), 90, "Adrian's Math Tuition");
  const sub = clamp(searchParams.get('sub'), 150, 'Small-group math tuition in Kovan, Singapore');
  const tag = clamp(searchParams.get('tag'), 42);

  // Long titles need to step down a size or they overflow the card.
  const titleSize = title.length > 62 ? 60 : title.length > 40 ? 72 : 84;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: NAVY,
          padding: '68px 76px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', width: 46, height: 6, background: AMBER }} />
          {tag ? (
            <div
              style={{
                display: 'flex',
                marginLeft: 22,
                fontSize: 25,
                letterSpacing: 2,
                color: AMBER,
                textTransform: 'uppercase',
              }}
            >
              {tag}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              lineHeight: 1.14,
              color: CREAM,
              letterSpacing: -1.5,
            }}
          >
            {title}
          </div>
          {sub ? (
            <div
              style={{
                display: 'flex',
                marginTop: 26,
                fontSize: 31,
                lineHeight: 1.42,
                color: MUTED,
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 29, color: CREAM }}>ADRIAN&apos;S</div>
          <div style={{ display: 'flex', marginLeft: 12, fontSize: 29, color: MUTED }}>
            math tuition
          </div>
          <div style={{ display: 'flex', flexGrow: 1 }} />
          <div style={{ display: 'flex', fontSize: 26, color: MUTED }}>adrianmathtuition.com</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
