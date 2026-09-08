-- ============================================================
-- Base Zen-Air — upgrade 2: difficoltà, valutazione AI, 10 quest
-- Incolla nell'SQL Editor di Supabase e premi Run. Idempotente.
-- ============================================================

-- ---------- nuove colonne ----------
alter table public.quests          add column if not exists difficulty  text not null default 'medio';  -- 'basso'|'medio'|'alto'
alter table public.quest_messages  add column if not exists eval_score   integer;
alter table public.quest_messages  add column if not exists eval_missing text;
alter table public.quest_messages  add column if not exists eval_improve text;

-- i membri possono aggiornare i messaggi (serve per salvare la valutazione AND lo stato)
drop policy if exists "messages update" on public.quest_messages;
create policy "messages update" on public.quest_messages
  for update using (public.is_member()) with check (public.is_member());

-- ---------- 10 quest di partenza (solo se ci sono <2 quest) ----------
insert into public.quests (title, brief, assignee, status, difficulty, created_by)
select v.title, v.brief, v.assignee, 'aperta', v.difficulty, 'mattia'
from (values
  ('Prezzi reali dei concorrenti in Italia',
   'Trova dove si comprano Honeyrose, Ecstacy o simili in Italia (online e fisico) e a che prezzo esatto al pacchetto. Almeno 3 fonti con link.',
   'diego', 'basso'),
  ('Quanti fumatori provano a smettere ogni anno',
   'Numero aggiornato di fumatori in Italia e in Europa, e quanti tentano di smettere ogni anno. Cita le fonti (ISS, Eurobarometro, OMS).',
   'pier', 'basso'),
  ('3 service di stampa 3D economici',
   'Trova 3 servizi (anche online) per stampare i primi prototipi in resina/plastica, con prezzo indicativo a pezzo e tempi.',
   'diego', 'basso'),
  ('Aromi alimentari sicuri per inalazione',
   'Cerca quali aromi alimentari hanno uno storico d''uso per inalazione (es. inalatori, aromaterapia) e sono considerati sicuri. Elenco con 5 candidati e motivo.',
   'pier', 'alto'),
  ('Le regole UE: siamo dentro la direttiva tabacco?',
   'Verifica se un prodotto senza tabacco e senza nicotina che si "aspira" rientra nella TPD (direttiva tabacco UE) o no. Trova il testo o una guida ufficiale.',
   'both', 'alto'),
  ('Materiale della capsula: plastica vs carta',
   'Confronta capsula in plastica riciclabile e capsula in carta/bioplastica compostabile: costo, fattibilità, tenuta dell''aroma. Pro e contro.',
   'pier', 'medio'),
  ('Come vendono le ricariche i marchi "a capsule"',
   'Guarda 3 marchi che vendono ricariche in abbonamento (caffè, rasoi, profumi): prezzo, frequenza di consegna, sconti. Cosa possiamo copiare.',
   'diego', 'medio'),
  ('10 ex fumatori da far provare al prototipo',
   'Fai una lista di 10 persone (conoscenti) ex fumatori o che vogliono smettere, disposte a provare il prototipo e darci un giudizio onesto.',
   'both', 'basso')
) as v(title, brief, assignee, difficulty)
where (select count(*) from public.quests) < 2;
