-- 5 Oct 2026 — Figures we need (Adrian: whenever a twin seed is parked because no figure-library
-- family fits, record the figure it needed; group them; tell him weekly; a shape needed by 3
-- seeds is ready to build). MATHS project (the one with job_runs). Both banks write here:
-- the maths twins lane, the science twins lane and the cloud-twins door.
-- It replaces the "3-candidate gate" counts that lived only as prose in CLAUDE.md
-- (venn-probability 2, riemann-rectangles 1 — seeded below as legacy rows).
create table if not exists public.figure_needs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  bank text not null check (bank in ('maths', 'science')),
  seed_id uuid,                       -- the bank question that wanted the figure (its own bank)
  subject text, level text, topic text,
  what text not null,                 -- one plain line: the figure the question needs
  shape text not null,                -- a normalised kebab-case key, e.g. 'venn-probability' (lib/figure-needs normShape)
  source text not null,               -- 'twins-lane' | 'science-twins-lane' | 'cloud-door' | 'legacy'
  status text not null default 'open' check (status in ('open', 'built', 'dropped')),
  built_family text, note text
);
alter table public.figure_needs add constraint figure_needs_seed_shape_key unique (bank, seed_id, shape);   -- NULL seeds (legacy rows) stay distinct
create index if not exists figure_needs_shape_idx on public.figure_needs (shape) where status = 'open';
alter table public.figure_needs enable row level security;   -- service key only, no policies
insert into public.figure_needs (bank, subject, level, topic, what, shape, source, note) values
  ('maths', 'maths', null, 'Probability', 'A Venn diagram with probabilities written in the regions', 'venn-probability', 'legacy', 'candidate 1 of 2 from the 3-candidate gate (CLAUDE.md figure library note, Sep 2026)'),
  ('maths', 'maths', null, 'Probability', 'A Venn diagram with probabilities written in the regions', 'venn-probability', 'legacy', 'candidate 2 of 2 from the 3-candidate gate (CLAUDE.md figure library note, Sep 2026)'),
  ('maths', 'maths', 'JC', 'Integration', 'Rectangles under a curve approximating the area (upper / lower sums)', 'riemann-rectangles', 'legacy', 'candidate 1 of 1 from the 3-candidate gate (CLAUDE.md figure library note, Sep 2026)')
on conflict do nothing;
