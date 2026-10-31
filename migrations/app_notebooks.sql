-- ☁️ Notebook backup (SPEC-STUDENT-APP.md §0d, 31 Oct 2026, Adrian: "yes" to saving the
-- Notebook iPad app's notebooks on our server under the student's account).
-- One row per notebook: its title, when it last changed on a device, and the manifest
-- (every file's path, size and SHA-256). The files themselves sit in the private
-- student-files bucket under notebooks/<identity>/<notebook-id>/ (lib/app-notebooks.ts).
-- A deleted notebook keeps its row (deleted_at set, manifest emptied) so the student's
-- other devices delete their copy too.
create table if not exists public.app_notebooks (
  user_id uuid not null references public.portal_accounts(id) on delete cascade,
  notebook_id uuid not null,
  identity text not null,
  title text not null default 'Untitled',
  updated_at timestamptz not null,
  manifest jsonb not null default '{}'::jsonb,
  bytes bigint not null default 0,
  deleted_at timestamptz,
  saved_at timestamptz not null default now(),
  primary key (user_id, notebook_id)
);
create index if not exists app_notebooks_identity on public.app_notebooks (identity);
alter table public.app_notebooks enable row level security;
grant select, insert, update, delete on table public.app_notebooks to service_role;

-- The student's subjects (folders) in the app: one list per student.
create table if not exists public.app_notebook_folders (
  user_id uuid primary key references public.portal_accounts(id) on delete cascade,
  identity text not null,
  folders jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_notebook_folders enable row level security;
grant select, insert, update, delete on table public.app_notebook_folders to service_role;
