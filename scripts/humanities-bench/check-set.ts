#!/usr/bin/env node
// Check draft case studies before they join the bank (SPEC-HUMANITIES.md §A1):
//   npx tsx scripts/humanities-bench/check-set.ts <file.json> [<file.json> …]
// Each file is one case study or an array of them. Prints every problem; exit 1 on any.
import fs from 'node:fs';
import { caseStudyProblems } from '../../src/lib/humanities-case-study';
import type { HumanitiesSet } from '../../src/lib/humanities-questions';

let bad = 0;
for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const set of (Array.isArray(raw) ? raw : [raw]) as HumanitiesSet[]) {
    const problems = caseStudyProblems({ ...set, subject: 'social-studies', kind: 'source' });
    if (problems.length) { bad += problems.length; console.log(problems.join('\n')); } else console.log(`${set.id}: fit to list`);
  }
}
process.exit(bad ? 1 : 0);
