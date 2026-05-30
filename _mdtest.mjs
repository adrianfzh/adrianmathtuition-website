import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

const content = `**ASRJC 2021 P1 Q9**

A curve $C$ has parametric equations $$x = \\tan 2\\theta - 1, \\quad y = 1 - 2\\sec 2\\theta, \\quad \\text{for } -\\frac{\\pi}{4} < \\theta < \\frac{\\pi}{4}.$$

<img src="https://x/y.png" alt="diagram" style="max-width:100%;display:block;margin:8px 0" />

(i) Find the coordinates of the point where $C$ cuts the $y$-axis. [2m]`;

function fixMathFences(src){return src.replace(/\$\$(?=\S)/g,()=> '$$\n').replace(/([^\n\s])\$\$/g,(_,c)=>`${c}\n$$`);}

async function run(label, src){
  const out = await unified()
    .use(remarkParse).use(remarkMath).use(remarkGfm)
    .use(remarkRehype, {allowDangerousHtml:true})
    .use(rehypeRaw).use(rehypeKatex, {strict:false,trust:true,throwOnError:false})
    .use(rehypeStringify).process(src);
  const html=String(out);
  console.log(`\n===== ${label} =====`);
  console.log('katex-error count:', (html.match(/katex-error/g)||[]).length);
  console.log('has <img tag:', html.includes('<img'));
  console.log('raw "<img" text escaped:', html.includes('&#x3C;img') || html.includes('&lt;img'));
}
await run('WITHOUT fixMathFences', content);
await run('WITH fixMathFences', fixMathFences(content));
