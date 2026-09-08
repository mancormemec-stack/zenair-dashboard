-- ============================================================
-- Base Zen-Air — schema Supabase
-- Incolla tutto questo nell'SQL Editor di Supabase e premi "Run".
-- È sicuro rieseguirlo (idempotente).
-- ============================================================

-- ---------- membri del team ----------
create table if not exists public.members (
  id        uuid primary key references auth.users on delete cascade,
  email     text unique not null,
  username  text unique not null,
  name      text not null,
  is_owner  boolean not null default false
);

-- Quando crei i 3 utenti in Authentication -> Users, questo trigger
-- riempie automaticamente la tabella members in base all'email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.members (id, email, username, name, is_owner)
  values (
    new.id,
    new.email,
    case new.email
      when 'mattia@zen-air.app' then 'mattia'
      when 'diego@zen-air.app'  then 'diego'
      when 'pier@zen-air.app'   then 'pier'
      else split_part(new.email, '@', 1)
    end,
    case new.email
      when 'mattia@zen-air.app' then 'Mattia'
      when 'diego@zen-air.app'  then 'Diego'
      when 'pier@zen-air.app'   then 'Pier'
      else initcap(split_part(new.email, '@', 1))
    end,
    new.email = 'mattia@zen-air.app'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- helper ----------
create or replace function public.is_member()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid())
$$;

create or replace function public.is_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid() and is_owner)
$$;

-- ---------- quest ----------
create table if not exists public.quests (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  brief      text not null default '',
  assignee   text not null,            -- 'diego' | 'pier' | 'both'
  status     text not null default 'aperta',
  due        text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_messages (
  id         uuid primary key default gen_random_uuid(),
  quest_id   uuid not null references public.quests on delete cascade,
  author     text not null,
  kind       text not null,            -- 'comment' | 'submission' | 'status'
  text       text not null default '',
  links      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_quest_messages_quest on public.quest_messages(quest_id, created_at);

-- ---------- memoria (note) ----------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_notes_updated on public.notes(updated_at desc);

-- ---------- RLS ----------
alter table public.members         enable row level security;
alter table public.quests          enable row level security;
alter table public.quest_messages  enable row level security;
alter table public.notes           enable row level security;

drop policy if exists "members read"        on public.members;
drop policy if exists "quests read"         on public.quests;
drop policy if exists "quests insert owner" on public.quests;
drop policy if exists "quests update"       on public.quests;
drop policy if exists "quests delete owner" on public.quests;
drop policy if exists "messages read"       on public.quest_messages;
drop policy if exists "messages insert"     on public.quest_messages;
drop policy if exists "notes read"          on public.notes;
drop policy if exists "notes insert"        on public.notes;
drop policy if exists "notes update"        on public.notes;
drop policy if exists "notes delete"        on public.notes;

create policy "members read" on public.members
  for select using (public.is_member());

create policy "quests read" on public.quests
  for select using (public.is_member());
create policy "quests insert owner" on public.quests
  for insert with check (public.is_owner());
create policy "quests update" on public.quests
  for update using (public.is_member()) with check (public.is_member());
create policy "quests delete owner" on public.quests
  for delete using (public.is_owner());

create policy "messages read" on public.quest_messages
  for select using (public.is_member());
create policy "messages insert" on public.quest_messages
  for insert with check (public.is_member());

create policy "notes read" on public.notes
  for select using (public.is_member());
create policy "notes insert" on public.notes
  for insert with check (public.is_member());
create policy "notes update" on public.notes
  for update using (public.is_member()) with check (public.is_member());
create policy "notes delete" on public.notes
  for delete using (public.is_member());

-- ---------- realtime (aggiornamento live tra i 3) ----------
do $$
begin
  alter publication supabase_realtime add table public.quests;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.quest_messages;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null; end $$;

-- ---------- 4 note di partenza (solo se la memoria e' vuota) ----------
insert into public.notes (title, body, created_by, updated_by)
select v.title, v.body, 'mattia', 'mattia'
from (values
('Zen-Air in breve',
'Zen-Air e'' uno **stick** che si respira solo con l''aria: niente nicotina, niente fumo, niente vapore. Serve a chi smette di fumare e sente la mancanza del **gesto**.

- Come funziona lo stick e le capsule: [[Il prodotto]]
- Con chi ci confrontiamo: [[I concorrenti]]
- Cosa facciamo, in ordine: [[Il piano]]

> Regola: non spendiamo in sito e marketing finche'' il prodotto non convince chi lo prova.'),
('Il prodotto',
'# Lo stick
Corpo permanente. L''aria entra da un tappo forato, e'' costretta ad attraversare l''aroma, passa in un filtro di cotone e arriva in bocca. Nessuna scorciatoia: pareti chiuse dentro, buchi solo sul tappo.

# Le capsule
- Ogni capsula e'' gia'' aromatizzata: **un gusto per capsula**
- Confezioni da **3 capsule dello stesso gusto** (es. 3 all''anguria), ~10 euro
- Consumo medio: circa 1 capsula al mese
- Dentro: fibra imbevuta di aroma alimentare, sigillata fino al primo uso

Prezzo dello stick: ~19 euro. Collegata a [[Zen-Air in breve]] e [[Il piano]].'),
('I concorrenti',
'Le cose piu'' simili sono le **sigarette senza tabacco**, a base di erbe:

- **Honeyrose** (UK, dal 1901) - la piu'' conosciuta, usata anche nei film
- **Ecstacy** (USA) - miscela di erbe, in crescita tra gli ex fumatori
- **Nirdosh** (India) - erbe con fama "curativa", mercato asiatico

Mercato reale: circa 1 miliardo di dollari nel mondo, in crescita a doppia cifra negli USA.

**Il punto:** bruciano tutte - fumo, catrame, monossido di carbonio. Zen-Air non brucia niente. Vedi [[Zen-Air in breve]].'),
('Il piano',
'Ordine delle cose. Prima quelle che possono far fallire l''idea.

1. **Il prodotto funziona** (mesi 1-4) - prototipo 3D, scelta dei 3 aromi, prova con 10-15 ex fumatori
2. **Sicurezza e regole** (mesi 3-7) - tecnico degli aromi, verifica sui 3 aromi, parere legale
3. **Quanto costa davvero** (mesi 5-8) - preventivi veri per stampo e piccola produzione, prezzo finale
4. **Marchio e sito** (mesi 7-10) - nome, logo, sito di vendita semplice, foto
5. **Marketing leggero** (mesi 9-12) - passaparola, Instagram/TikTok, 2-3 creator, lista d''attesa
6. **Lancio in Italia** (dal mese 12) - prima produzione, vendita dal sito, recensioni

Dettagli prodotto in [[Il prodotto]].')
) as v(title, body)
where not exists (select 1 from public.notes);
