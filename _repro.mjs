import {unified} from './node_modules/unified/index.js';
import remarkParse from './node_modules/remark-parse/index.js';
import remarkGfm from './node_modules/remark-gfm/index.js';
import remarkRehype from './node_modules/remark-rehype/index.js';
import rehypeRaw from './node_modules/rehype-raw/index.js';
import rehypeStringify from './node_modules/rehype-stringify/index.js';
const md = `- Centre x
- radius a

<img src="https://x/y.png" alt="diagram" style="display:block; margin:8px 0; width:161px;max-width:100%" />

*Eg:* something here
`;
const out = await unified().use(remarkParse).use(remarkGfm).use(remarkRehype,{allowDangerousHtml:true}).use(rehypeRaw).use(rehypeStringify).process(md);
console.log(String(out));
