-- 📏 consistency_set — the fixed set of papers re-read in SHADOW every Sunday
-- (17 Sep 2026, Adrian: "we need consistency in marking … how can we measure
-- the effectiveness of all these changes?").
--
-- One row per paper Adrian wants watched. The Sunday cron
-- (/api/cron/consistency-remark) asks the bot to read each ACTIVE row's paper
-- again — the reading is filed beside the paper's real marking in
-- paper_marking_runs.result_json.shadow_runs[] and is never delivered — and the
-- Monday report prints how far the marking moved.
--
-- Deliberately tiny: the set is a handful of papers Adrian curates by hand, not
-- a sample, and `active` rather than a delete so a paper can be rested and
-- brought back without losing the note that says why it is in the set.

CREATE TABLE IF NOT EXISTS consistency_set (
  run_id     uuid PRIMARY KEY REFERENCES paper_marking_runs (id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  note       text,
  active     boolean NOT NULL DEFAULT true
);

-- The cron reads "every active row" and nothing else, every week.
CREATE INDEX IF NOT EXISTS idx_consistency_set_active
  ON consistency_set (active) WHERE active;

-- Service-key only, like every other admin-owned table here: no student, no
-- anon key and no portal session has any business reading the measurement set.
ALTER TABLE consistency_set ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
