// Builds the PLAN-billed test-solve batches (out/ts-NN.json, 200 questions each; figures
// downloaded to out/img/ so an agent can open them with the Read tool). Two separate model
// "haiku" Agent spawns per batch answer letter-only — no key and no solution shown. Adrian,
// 5 Oct 2026: the sorting runs on plan usage, never the API.
//   node scripts/practice-difficulty/prep-test-solve.cjs
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out');
const all = require('./out/all.json');
const saved = path.join(__dirname, 'saved', 'test-solve-sample.json');
const done = new Set(fs.existsSync(saved) ? require(saved).map(r => r.id) : []);
(async () => {
  fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
  const todo = all.filter(q => !done.has(q.id));
  for (const q of todo) {
    const urls = [...q.markdown.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]);
    q._imgs = [];
    for (const [i, u] of urls.entries()) {
      const ext = (u.match(/\.(png|jpe?g|gif|webp)(\?|$)/i) || [, 'png'])[1];
      const f = path.join(OUT, 'img', `${q.id}-${i}.${ext}`);
      if (!fs.existsSync(f)) {
        const r = await fetch(u);
        if (!r.ok) { console.error('figure failed', q.id, r.status); continue; }
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      }
      q._imgs.push(f);
    }
  }
  const B = 200; let b = 0;
  for (let i = 0; i < todo.length; i += B, b++) {
    const rows = todo.slice(i, i + B).map(q => {
      let k = 0;
      return { id: q.id, subject: q.subject, question: q.markdown.replace(/<img[^>]*>/g, () => `[FIGURE — open it with the Read tool: ${q._imgs[k++] || '(missing)'}]`) };
    });
    fs.writeFileSync(path.join(OUT, `ts-${String(b).padStart(2, '0')}.json`), JSON.stringify(rows));
  }
  console.log('questions', todo.length, 'batches', b);
})();
