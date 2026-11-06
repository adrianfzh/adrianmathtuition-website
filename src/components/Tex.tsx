'use client';

// Prose with `$…$` maths, typeset — shared by /admin/question-proposals and "Decide here" on /admin.
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Questions arrive as prose with `$…$` maths, the same way they are stored in the
// bank — so the page has to typeset them. Printing the source instead turns a
// question into "$y = 2x^3 - 3x^2 + px - 1$", which is exactly the leak this
// pipeline keeps producing elsewhere: the content was right, the surface could
// not draw it. A vetting page above all others has to show what Adrian is ruling
// on, not its markup.
//
// throwOnError false on purpose: a malformed segment renders as red source and
// the rest of the question still reads, which is the useful failure — an
// exception here would blank the card and hide the very thing being vetted.
function renderMath(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf('$', i);
    if (start < 0) { out.push(esc(src.slice(i))); break; }
    const end = src.indexOf('$', start + 1);
    if (end < 0) { out.push(esc(src.slice(i))); break; }
    out.push(esc(src.slice(i, start)));
    const tex = src.slice(start + 1, end);
    try {
      out.push(katex.renderToString(tex, { displayMode: false, throwOnError: false, output: 'html' }));
    } catch {
      out.push(esc(`$${tex}$`));
    }
    i = end + 1;
  }
  return out.join('');
}

/** Prose-with-maths, typeset. Named Tex, not Math: a component called `Math`
 *  shadows the global object, and the first casualty was Math.floor two lines
 *  below it. */
export default function Tex({ children, style }: { children: string; style?: React.CSSProperties }) {
  return <span style={style} dangerouslySetInnerHTML={{ __html: renderMath(children) }} />;
}
