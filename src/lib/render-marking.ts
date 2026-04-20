import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer-core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RenderRequest {
  marking: MarkingOutput;
  student: {
    name: string;
    level: string;
  };
  timestamp: string;
  diagram_crop_data_url?: string;
}

export interface MarkingOutput {
  question?: {
    number?: string;
    prompt?: string;
    max_marks?: number;
    has_diagram?: boolean;
  };
  correct?: {
    final_answer?: string;
    method_summary?: string;
  };
  lines: MarkingLine[];
  student_final_answer?: {
    value_raw?: string;
    value_latex?: string;
    matches_correct?: boolean;
    had_self_correction?: boolean;
  };
  marks?: {
    awarded?: number;
    max?: number;
    margin_note?: string;
  };
  summary?: {
    title?: string;
    body_markdown?: string;
  };
  uncertainty?: {
    raised?: boolean;
    notes?: string[];
  };
  meta?: {
    level_detected?: string;
    topic_detected?: string;
  };
}

export interface MarkingLine {
  line_index: number;
  transcription_latex?: string;
  transcription_plain?: string;
  is_crossed_out?: boolean;
  verdict?: 'correct' | 'wrong' | 'neutral';
  error_type?: string | null;
  correction?: {
    arrow?: 'up' | 'down' | 'right';
    text_latex?: string;
    text_plain?: string;
  } | null;
}

// ── Browser singleton ─────────────────────────────────────────────────────────

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;

  const isProd = process.env.VERCEL === '1';
  if (isProd) {
    const chromium = await import('@sparticuz/chromium-min');
    const executablePath = await chromium.default.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'
    );
    browserInstance = await puppeteer.launch({
      args: chromium.default.args,
      executablePath,
      headless: true,
    });
  } else {
    browserInstance = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

export async function closeMarkingBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export async function renderMarkingPNG(payload: RenderRequest): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // High-DPI viewport for crisp PNG output
    await page.setViewport({ width: 820, height: 1200, deviceScaleFactor: 2 });

    const html = await buildMarkingHTML(payload);
    // networkidle0 ensures Google Fonts and KaTeX CDN assets are fully loaded
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });

    // Wait for KaTeX auto-render to complete (template sets window.__katexRendered)
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if ((window as any).__katexRendered) return resolve();
        const start = Date.now();
        const iv = setInterval(() => {
          if ((window as any).__katexRendered || Date.now() - start > 8000) {
            clearInterval(iv);
            resolve();
          }
        }, 50);
      });
    });

    // Extra wait for font swap (Caveat can arrive late)
    await new Promise(r => setTimeout(r, 500));

    // Capture only the .container element, not viewport whitespace
    const rect = await page.evaluate(() => {
      const el = document.querySelector('.container') as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.floor(r.left),
        y: Math.floor(r.top),
        width: Math.ceil(r.width),
        height: Math.ceil(r.height),
      };
    });

    const screenshot = await page.screenshot({
      type: 'png',
      clip: rect ?? undefined,
      omitBackground: false,
    });

    return Buffer.from(screenshot);
  } finally {
    await page.close();
  }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

async function buildMarkingHTML(payload: RenderRequest): Promise<string> {
  const templatePath = path.join(process.cwd(), 'public', 'marking-template.html');
  const template = await fs.readFile(templatePath, 'utf8');

  // Escape </script so payload JSON can't break out of the script tag
  const payloadJson = JSON.stringify(payload).replace(/<\/script/gi, '<\\/script');

  return template.replace('/*PAYLOAD_PLACEHOLDER*/', payloadJson);
}
