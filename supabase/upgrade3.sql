-- ============================================================
-- Base Zen-Air — upgrade 3: allegati (file) su quest e note
-- Incolla nell'SQL Editor di Supabase e premi Run. Idempotente.
--
-- PRIMA di questo: crea il bucket dei file dal pannello Supabase:
--   Storage -> New bucket -> Name: files -> attiva "Public bucket" -> Save
-- ============================================================

-- colonne per gli allegati
alter table public.quest_messages add column if not exists files jsonb not null default '[]'::jsonb;
alter table public.notes          add column if not exists files jsonb not null default '[]'::jsonb;

-- policy sullo storage: i membri del team possono caricare/eliminare nel bucket "files"
-- (la lettura è già pubblica perché il bucket è "Public")
drop policy if exists "files member insert" on storage.objects;
drop policy if exists "files member delete" on storage.objects;
drop policy if exists "files member update" on storage.objects;

create policy "files member insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and public.is_member());

create policy "files member update" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and public.is_member())
  with check (bucket_id = 'files' and public.is_member());

create policy "files member delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and public.is_member());
