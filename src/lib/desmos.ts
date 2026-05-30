// Desmos graph rendering — loads the Desmos API on demand, plots equations in a hidden square
// calculator, and returns a PNG data URL screenshot. Used to insert accurate graphs into lesson
// cards (the LLM can't draw accurate coordinate-axes graphs; Desmos is a real plotting engine).
//
// API key: set NEXT_PUBLIC_DESMOS_API_KEY to your own free Desmos API key. Falls back to Desmos's
// public demo key, which works but you should register your own for production use.

const DESMOS_API_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY || 'dcb31709b452b1cf9dc26972add0fda6';

type Bounds = { left: number; right: number; bottom: number; top: number };
type DesmosCalc = {
  setExpression: (e: { id: string; latex: string }) => void;
  setMathBounds: (b: Bounds) => void;
  asyncScreenshot: (opts: Record<string, unknown>, cb: (dataUrl: string) => void) => void;
  destroy: () => void;
};
type DesmosGlobal = { GraphingCalculator: (el: HTMLElement, opts?: Record<string, unknown>) => DesmosCalc };

let loadPromise: Promise<DesmosGlobal> | null = null;

function loadDesmos(): Promise<DesmosGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const existing = (window as unknown as { Desmos?: DesmosGlobal }).Desmos;
  if (existing) return Promise.resolve(existing);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<DesmosGlobal>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.desmos.com/api/v1.10/calculator.js?apiKey=${DESMOS_API_KEY}`;
    s.async = true;
    s.onload = () => {
      const g = (window as unknown as { Desmos?: DesmosGlobal }).Desmos;
      if (g) resolve(g); else reject(new Error('Desmos loaded but unavailable'));
    };
    s.onerror = () => { loadPromise = null; reject(new Error('Could not load Desmos (check network / API key)')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

/** Plot `equations` (Desmos syntax, one per expression) and return a square PNG data URL. */
export async function renderDesmosPng(equations: string[], opts?: { size?: number; bound?: number }): Promise<string> {
  const Desmos = await loadDesmos();
  const size = opts?.size ?? 600;
  const bound = opts?.bound ?? 10;
  const bounds: Bounds = { left: -bound, right: bound, bottom: -bound, top: bound };

  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-99999px', top: '0', width: `${size}px`, height: `${size}px` });
  document.body.appendChild(host);

  const calc = Desmos.GraphingCalculator(host, {
    settingsMenu: false, zoomButtons: false, expressions: false, lockViewport: true, border: false,
  });
  try {
    calc.setMathBounds(bounds); // square bounds so circles render round
    equations.forEach((latex, i) => calc.setExpression({ id: `e${i}`, latex }));
    return await new Promise<string>((resolve) => {
      // Let Desmos compute the plot, then screenshot with square math bounds.
      setTimeout(() => {
        calc.asyncScreenshot({ width: size, height: size, targetPixelRatio: 2, mathBounds: bounds }, (url) => resolve(url));
      }, 400);
    });
  } finally {
    try { calc.destroy(); } catch { /* ignore */ }
    host.remove();
  }
}
