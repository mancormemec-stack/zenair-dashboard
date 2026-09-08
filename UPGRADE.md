# Base Zen-Air — upgrade 2

Novità: home screen animata, link al **Deck**, tab **Brain** (mappa delle note trascinabile),
**livello** sulle quest (basso/medio/alto), **10 quest** di partenza, e la **valutazione AI**
delle risposte (voto 1-10 + cosa manca + come migliorare).

## 1) Database — SQL (30 secondi)

Supabase → **SQL Editor** → incolla il file **`supabase/upgrade.sql`** → **Run**.
(Aggiunge le colonne, le regole, e le 10 quest.)

## 2) Valutazione AI — Edge Function (5 minuti, una volta sola)

Serve una **API key Groq** (ce l'hai per Jarvis, o gratis su console.groq.com → API Keys).

1. Supabase → **Edge Functions** → **Deploy a new function**.
2. Nome: **`evaluate`**. Incolla tutto il contenuto di **`supabase/functions/evaluate/index.ts`** → **Deploy**.
3. Supabase → **Edge Functions** → **Secrets** (o Manage secrets) → **Add new secret**:
   - Name: `GROQ_API_KEY`
   - Value: la tua key Groq
4. Fatto. Se salti questo passo il sito funziona lo stesso, solo senza valutazione automatica.

## 3) Sito — nuovo zip

Trascina **`zenair-dist.zip`** su Netlify (pagina del sito → riquadro "Drag and drop…" o **Deploys**).

## Come funziona la valutazione

Quando Diego o Pier premono **"Invia come risultato"**, l'AI legge il compito e la risposta,
dà un **voto da 1 a 10**, dice **cosa manca** e **come migliorare**. Compare sotto il risultato.
Mattia può comunque approvare o rimandare indietro a mano. C'è anche un bottone
**"Valuta con AI" / "Rivaluta con AI"** su ogni risultato.
