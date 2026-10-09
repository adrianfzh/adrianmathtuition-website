-- Worksheet picker: the page's working state per saved selection (9 Oct 2026, Adrian:
-- "save the state so I can go back to the same state even if I leave the page").
-- {title, subtitle, cands: uuid[], picked: uuid[], savedAt}; null = untouched.
-- Applied to adrianmathtuition (nempslbewxtlikfzachi) on 9 Oct 2026.
alter table public.worksheet_picks add column if not exists state jsonb;
