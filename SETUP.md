# Base Zen-Air — messa online (Supabase + Netlify)

Tempo totale: ~15 minuti. Serve un account **Supabase** (gratis) e uno **Netlify** (gratis).
Diego e Pier **non** devono avere account: useranno solo la password che gli dai.

---

## 1) Supabase (il database + il login)

1. Vai su **supabase.com** → *New project*. Nome: `zen-air`. Regione: Europe (Frankfurt). Scegli una password DB e salvala.
2. Aspetta ~2 min che il progetto sia pronto.
3. Menu a sinistra → **SQL Editor** → *New query*. Apri il file **`supabase/schema.sql`** di questo progetto, copia **tutto**, incollalo e premi **Run**. Deve dire "Success".
4. Menu → **Authentication** → **Users** → bottone **Add user** → *Create new user*. Falla 3 volte, spuntando ogni volta **"Auto Confirm User"**:

   | Email | Password |
   |---|---|
   | `mattia@zen-air.app` | `Mango007!` |
   | `diego@zen-air.app` | `Diegospano12` |
   | `pier@zen-air.app` | `Pierfra1611` |

5. Verifica: menu → **Table Editor** → tabella **`members`**: devono esserci 3 righe (mattia = owner ✓).
6. Menu → **Project Settings** (ingranaggio) → **API**. Copia questi due valori, ti servono dopo:
   - **Project URL** (tipo `https://abcdefgh.supabase.co`)
   - **anon public** key (una stringa lunga che inizia con `eyJ…`)

---

## 2) Netlify (il sito)

Due modi. **Il modo A è il più veloce.**

### Modo A — trascina la cartella (nessun repo Git)

1. Sul tuo PC, in questa cartella:
   ```
   npm install
   ```
2. Crea un file chiamato **`.env`** (copia `.env.example`) e mettici i due valori del punto 1.6:
   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Crea il sito:
   ```
   npm run build
   ```
   Si crea una cartella **`dist`**.
4. Vai su **app.netlify.com/drop** (fai login/registrazione), e **trascina dentro la cartella `dist`**. In 20 secondi hai un URL tipo `https://random-name-123.netlify.app`.
5. (Facoltativo) Netlify → *Site configuration* → *Change site name* per avere `base-zenair.netlify.app`.

> Se cambi i valori Supabase devi rifare `npm run build` e ri-trascinare `dist`.

### Modo B — da GitHub (deploy automatico a ogni modifica)

1. Metti questa cartella in un repo GitHub (privato).
2. Netlify → *Add new site* → *Import from Git* → scegli il repo.
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Netlify → *Site configuration* → *Environment variables* → aggiungi:
   - `VITE_SUPABASE_URL` = il Project URL
   - `VITE_SUPABASE_ANON_KEY` = la anon key
4. *Deploys* → *Trigger deploy*. Fatto.

---

## 3) Uso

Apri l'URL Netlify, scegli il nome, metti la password. Fine.

- **Mattia** (owner): crea le quest, approva o rimanda indietro i risultati, gestisce tutto.
- **Diego / Pier**: vedono le quest loro assegnate, ci lavorano, premono *Invia come risultato*.
- **Memoria**: note in markdown collegate con `[[Titolo]]`, per tutti e tre. Già dentro 4 note di partenza.
- Aggiornamenti in tempo reale tra i tre (grazie a Supabase Realtime).
- Ognuno può cambiare la propria password dal bottone **Password** in alto.

---

## Note

- **Privacy**: l'URL Netlify è pubblico ma mostra solo la schermata di login; tutti i dati sono protetti dal login e dalle regole di sicurezza (RLS) di Supabase.
- **Cambiare i nomi / le email del team**: modifica `TEAM` in `src/supabase.ts` **e** il blocco `handle_new_user` in `supabase/schema.sql`, poi ricrea gli utenti.
- **Dimenticata una password**: Supabase → Authentication → Users → i tre puntini sulla riga → *Send password recovery* oppure *Update user* per impostarne una nuova a mano.
- **Costo**: piano gratuito Supabase (fino a 500 MB DB, ampiamente sufficiente) + piano gratuito Netlify.
