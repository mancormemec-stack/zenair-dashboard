-- ============================================================
-- Base Zen-Air — upgrade 4
-- Memoria organizzata in SEZIONI + contenuto riscritto.
-- Incolla tutto nell'SQL Editor di Supabase e premi "Run".
-- Sicuro rieseguirlo: rifà le note da capo ogni volta.
-- ============================================================

-- 1) colonna sezione
alter table public.notes add column if not exists section text not null default 'Generale';

-- 2) contenuto: si riparte da una memoria pulita e ordinata
delete from public.notes;

insert into public.notes (title, section, body, created_by, updated_by) values

-- ---------- COSA È ----------
('Zen-Air in breve', 'Cosa è', $md$
Zen-Air è uno **stick** che si respira solo con l'aria: niente nicotina, niente fumo, niente vapore, niente combustione. Serve a chi smette di fumare e sente la mancanza del **gesto**.

- Come è fatto e come funziona: [[Come funziona lo stick]]
- Con chi ci confrontiamo: [[Sigarette senza tabacco]]
- Perché può funzionare adesso: [[Il gesto conta]]
- Cosa facciamo, in ordine: [[Il piano]]

**I soci:** Mattia Mancini, Diego Spano, PierFrancesco Pirro. Tutti e tre CEO.

**Fase:** pre-prototipo. Budget prototipi ~4-5k euro. Nessun piano di raccolta capitali per ora.

> Regola: non spendiamo in sito e marketing finché il prodotto non convince chi lo prova.
$md$, 'mattia', 'mattia'),

('Come funziona lo stick', 'Cosa è', $md$
# Lo stick
Corpo permanente, riutilizzabile. L'aria entra da un tappo forato, è costretta ad attraversare la capsula aromatizzata, passa in un filtro di cotone e arriva in bocca. Nessuna scorciatoia: pareti chiuse dentro, buchi solo sul tappo. Prezzo indicativo: ~19 euro.

# Le capsule
- Ogni capsula è **già aromatizzata**: un solo gusto per capsula.
- Dentro: fibra imbevuta di aroma alimentare, sigillata fino al primo uso.
- Consumo medio stimato: circa 1 capsula al mese a persona.

# La ricarica
- Si vende a **confezione da 3 capsule dello stesso gusto** (es. 3 all'anguria), ~10 euro.
- Modello "razor & blade": lo stick quasi in pareggio, il margine vive sulle capsule ricorrenti. Vedi [[Il modello ad abbonamento]].

Dettagli su materiali e aromi: [[La capsula]] e [[Gli aromi]].
$md$, 'mattia', 'mattia'),

-- ---------- PRODOTTO ----------
('Gli aromi', 'Prodotto', $md$
Il rischio più importante del prodotto: **un aroma sicuro da mangiare non è automaticamente sicuro da respirare.**

## Cosa dice la ricerca
- Oli essenziali più tollerati per inalazione: **lavanda, menta piperita, limone/agrumi, eucalipto**. Comunque concentrati: se inalati diretti irritano le vie respiratorie (peggio per asma o BPCO).
- Lo status **GRAS** della FDA e i pareri EFSA valgono **solo per l'ingestione**, non per l'inalazione. FEMA (ente USA degli aromi) lo dichiara esplicitamente.
- Non c'è tossicologia inalatoria umana per la maggior parte delle molecole aromatiche. Precedente noto: il diacetile (aroma burro/vaniglia) ha causato la "popcorn lung" tra i lavoratori.
- Mischiare più oli può aumentare la tossicità: sono valutati come agenti singoli.

## Scelte per Zen-Air
- Partire da **1 solo aroma per capsula**, mai miscele all'inizio.
- Molecole con storia d'uso in inalazione (mentolo, eucaliptolo, oli di agrumi, lavanda).
- **Dose bassa**: fibra leggermente imbevuta, non satura.
- Prima di vendere: test di sicurezza (vedi sotto) + parere di un tossicologo.

## Fornitori (flavour house)
Chi scrive "for inhalation use" dichiara l'uso previsto, NON una certificazione di sicurezza.
- **Flavourtec** (flavourtec.net) - gruppo europeo (Polonia), grande produttore UE di aromi e basi per e-liquid, fa anche private label / piccoli volumi.
- Produttori francesi di aromi e-liquid su Europages (categoria "e-liquid flavours"), molti vendono campioni.
- Grandi aroma house (Robertet, Symrise) hanno linee vaping ma trattano volumi industriali.
- Da chiedere a ognuno: scheda tecnica, assenza di diacetile/acetilpropionile/acetoina, se il profilo è testato per aerosol, prezzo campione da 100-500 ml.

## Test di sicurezza inalatoria
- Test giusto: **tossicologia respiratoria in vitro a interfaccia aria-liquido (ALI)** su epitelio delle vie aeree umano ricostituito (modelli tipo MucilAir / EpiAirway). Misura citotossicità, vitalità del tessuto, barriera (TEER), battito ciliare, citochine infiammatorie.
- Laboratori: **Cultex Laboratories** (Hannover, DE - specializzati proprio in questo), **Vitrocell Systems** (DE), **Charles River** (CRO globale, siti in Europa), Institute for In Vitro Sciences (IIVS, USA).
- **PETA Science Consortium** (thepsci.eu): non è un lab commerciale ma dà consulenza gratuita per impostare lo studio giusto.
- Cifra indicativa (da confermare con preventivo): screening ALI su 2-3 aromi ~ **10-30k euro**. Il costo vero è setup del metodo + tempo GLP + reportistica, non i reagenti.

Fonti: femaflavor.org/safety-evaluation · nature.com/articles/s41538-020-00075-y · thepsci.eu/inhalation-resources
$md$, 'mattia', 'mattia'),

('La capsula', 'Prodotto', $md$
Materiale e produzione della capsula.

## Materiale: plastica vs bioplastica
Da uno studio Wageningen sulle capsule del caffè, in ordine di sostenibilità:
1. **Bioplastica compostabile (PLA)** - la migliore su gas serra e circolarità (~100% se compostata).
2. **Alluminio** - circolarità <60%, ma riciclabile all'infinito.
3. **Plastica vergine** - la peggiore.

Per Zen-Air: la capsula contiene fibra + aroma alimentare, non cibo, quindi requisiti meno stringenti del caffè. **PLA compostabile** = miglior racconto + fattibile con termoformatura. Per i primi prototipi va bene plastica riciclabile semplice, si passa a PLA dopo.

Da verificare: la PLA sigillata trattiene l'aroma per settimane senza farlo evaporare? Potrebbe servire un film barriera interno.

## Termoformatori (Italia / EU) che lavorano la PLA
1. **New Look Packaging** - Rudiano (BS), ISO 9001, 20+ anni, lavora PVC/PET/RPET/PP/PLA, piccole serie e stampi su misura. Candidato n.1.
2. **Euroform srl** - Emilia Romagna / Lombardia, blister e vaschette trasparenti, preventivo gratuito e senza impegno.
3. Seriplast, Blister & Packaging (fa anche render + prototipo), imballaggio-blister.it (produzione in Germania).

## Come funzionano i costi
- Stampo in alluminio per una forma piccola tipo capsula: ~**500-2.000 euro** una tantum.
- Costo a pezzo: **0,02-0,15 euro** secondo materiale, spessore, dimensioni.
- MOQ tipico: **1.000-5.000 pezzi** per lotto; per PLA compostabile a volte di più.
- La PLA è più delicata in produzione: va chiesta esplicitamente.

**Prossimo passo:** appena c'è il modello 3D della capsula, mandarlo a New Look Packaging + Euroform per costo stampo, prezzo/pezzo a 1k / 5k / 10k, MOQ, PLA sì/no.

Fonti: sustainableplastics.com (studio capsule compostabili) · packaging-mag.com
$md$, 'mattia', 'mattia'),

('I prototipi', 'Prodotto', $md$
I primi pezzi fisici dello stick e della capsula.

## JLC3DP (jlc3dp.com)
- SLA / resina, prezzo dichiarato **da 0,30 USD a pezzo, nessun minimo d'ordine**.
- Preventivo istantaneo caricando il file (STEP/STL), produzione da 2 giorni.
- Resine disponibili: Ledo 6060, Black Resin, Transparent 8001 + altre (rigide, tipo-ABS, trasparenti).
- Spedizione dalla Cina: economica ~1-2 settimane, express pochi giorni (costa più dei pezzi).

## Stima per noi
- Corpo stick + capsula, 20-30 pezzi in resina: **~200-400 euro** totali + ~20-40 euro spedizione.
- Con 3-4 iterazioni del corpo si resta ampiamente sotto i 5k di budget prototipi.

## Alternative
- **Protolabs Network** (ex Hubs) - preventivo istantaneo, consegna anche in 1 giorno, qualità alta, prezzo ~2-3x JLC3DP.
- **Stampante a resina propria** - ~200-400 euro la macchina + resina 90-200 euro/litro. Conviene se iteriamo molto (>5 giri).

**Prossimo passo:** Mattia finisce il CAD → upload su jlc3dp.com → screenshot del preventivo reale + tempi.

Legato a [[Il piano]] e [[La capsula]].
$md$, 'mattia', 'mattia'),

-- ---------- CONCORRENTI ----------
('Sigarette senza tabacco', 'Concorrenti', $md$
Le cose più simili a Zen-Air sono le **sigarette senza tabacco** (herbal cigarettes), a base di erbe.

## Marchi principali
- **Honeyrose** (UK, dal 1901) - la più conosciuta, "100% senza tabacco e nicotina, made in England". Gamma: Deluxe (base neutra), Blue (ultra light), aromatizzate (vaniglia, cioccolato, mentolo, fragola). Usata anche nei film.
- **Ecstacy** (USA) - miscela di erbe, gusti particolari, in crescita tra gli ex fumatori.
- **Nirdosh** (India) - erbe ayurvediche, posizionamento "curativo", mercato asiatico.
- Altri: American Billy (tè verde), Brown Bear Herbs, Dreams Herbal.

## Ingredienti Honeyrose
Foglie di malva/marshmallow, trifoglio rosso, petali di rosa, succhi di frutta, miele. Zero tabacco, zero nicotina.

## Prezzo
Indicativamente **6-8 euro a pacchetto da 20**. Online in Italia si trovano stecche da 200 sigarette a ~40 euro (~4 euro/pacchetto). Vedi [[Dove si comprano in Italia]].

## Mercato
Stime molto diverse tra loro: da ~500 milioni a ~1,2 miliardi di dollari nel 2025, crescita ~7-10% l'anno. Nicchia reale ma non un mega-mercato.

## Il punto per noi
**Bruciano tutte** - fumo, catrame, monossido di carbonio, puzza sui vestiti. Zen-Air non brucia niente: si respira solo aria attraverso un aroma. È l'unico vero vantaggio, e va difeso.

Come Zen-Air è diverso: [[Come funziona lo stick]]. Perché serve comunque: [[Il gesto conta]].
$md$, 'mattia', 'mattia'),

('Dove si comprano in Italia', 'Concorrenti', $md$
Le sigarette senza tabacco in Italia **non si trovano in tabaccheria**. Il canale è erboristeria / parafarmacia / online.

## Online (spediscono in Italia)
- **sigarettealleerbe.com** - rivenditore Honeyrose più completo. Stecca da 10 pacchetti / 200 sigarette a **39,99 euro** (~4 euro/pacchetto), a magazzino. Vende anche i singoli gusti.
- **littlepioneer.it** - Honeyrose Deluxe e aromatizzate, ~6-7 euro/pacchetto.
- **prezzifarmaco.it / 3cfarma.it / farmafides.it / farmaciedelsorriso.it** - parafarmacie online, Honeyrose Deluxe listino ~6,80 euro, spesso "non disponibile".
- **Amazon.it** - importate (Honeyrose vaniglia/fragola/cioccolato, anche sampler da 3 pacchetti), prezzo più alto perché import.

## Negozio fisico
Qualche erboristeria / "tabaccheria erboristica" le tiene su ordinazione, ma non è un prodotto da banco. Nessuna catena le espone.

## Lettura per noi
Distribuzione fisica praticamente inesistente: chi le compra le cerca apposta online. Conferma che per Zen-Air il canale giusto è **vendita diretta dal sito**, dove stanno margine e dati. Vedi [[Il modello ad abbonamento]].
$md$, 'mattia', 'mattia'),

-- ---------- MERCATO ----------
('Quanti fumatori e quanti smettono', 'Mercato', $md$
Dati per dimensionare il pubblico.

## Italia (ISS - Rapporto Nazionale sul Tabagismo 2025)
- **~24% degli adulti 18-69 fuma** = circa **10,5 milioni di persone**.
- Nel 2023-2024 **un terzo dei fumatori ha tentato di smettere** almeno per un giorno.
- Solo il **~12%** è riuscito a restare senza fumare per oltre 6 mesi.
- Tentativi più frequenti tra i più giovani e i più istruiti.
- 223 centri antifumo (60% al nord).

## Europa
Circa 73 milioni di fumatori nell'UE, percentuale di tentativi annui simile.

## Lettura per noi
Circa **3,5 milioni di italiani provano a smettere ogni anno** e la gran parte fallisce. Non serve prenderli tutti: anche una frazione minima è un mercato sufficiente. Perché tanti falliscono → [[Il gesto conta]].

Fonti: epicentro.iss.it/passi/dati/SmettereFumo · tabaccoendgame.it
$md$, 'mattia', 'mattia'),

('Il gesto conta', 'Mercato', $md$
Perché Zen-Air ha senso: il **gesto mano-bocca** è una componente reale delle ricadute, in parte **indipendente dalla nicotina**.

## Cosa dice la letteratura
- Studio 2026 (Frontiers in Pharmacology): i "gesti legati al fumo" sono una dimensione comportamentale a sé del tabagismo. Il gesto ripetuto funziona come rituale anti-stress, con un meccanismo abitudine **stimolo → routine → ricompensa** radicato nei gangli della base. Gli autori scrivono che questo "può spiegare perché alcuni fumatori faticano a smettere nonostante una bassa dipendenza biochimica".
- Review NCBI/PMC: la componente sensomotoria e rituale (mano alla bocca, inspirare, tenere qualcosa tra le dita) è un fattore di mantenimento distinto dalla farmacologia della nicotina. È il motivo per cui inalatori senza nicotina e sigarette finte riducono comunque il craving in una parte dei fumatori.
- Coerente con la pratica clinica: l'inalatore di nicotina è l'unico sostitutivo che agisce anche sul gesto, ed è preferito da chi è molto legato al rituale.

## Cosa NON sappiamo
Non esiste una statistica pulita "quanti ricominciano per il gesto vs per la nicotina". La dipendenza è multifattoriale e gli studi non la scompongono in percentuali nette.

## Come lo comunichiamo
Con onestà: **Zen-Air aiuta sul rituale, non toglie la dipendenza chimica da nicotina.**

Fonti: frontiersin.org/articles/10.3389/fphar.2026.1904931 · ncbi.nlm.nih.gov/pmc/articles/PMC12540410
$md$, 'mattia', 'mattia'),

('Il modello ad abbonamento', 'Mercato', $md$
Come vendere le capsule: modello "razor & blade" (stick a poco, margine sul consumabile).

## Riferimento: Dollar Shave Club (rasoi)
- Consegna a domicilio, prodotto trattato come consumabile.
- **Retention: ~50% dei clienti ancora attivi al mese 12; oltre 1/3 dopo 2 anni.**
- Da 0 a 200 milioni di dollari di ricavi, poi comprata da Unilever per 1 miliardo.

## Due modelli attivi in Italia
1. **Nespresso "Piani Easy"**: la rata mensile diventa credito cumulabile in capsule; **-10%** sulla fornitura + **10% di credito extra**/mese, spedizione gratis, assistenza 24/7. Capsula ~0,40-0,55 euro. Dopo 12 mesi diventa "Easy+" con macchina in regalo. Disdetta senza vincoli.
2. **Amazon "Iscriviti e Risparmia"**: frequenza da 1 a 6 mesi, consegna automatica; sconto **5%**, fino a **15%** con 5+ abbonamenti nella stessa consegna. Disdetta in 1 click, nessuna penale.

## Cosa copiare per Zen-Air
- Prezzo capsula basso e trasparente, sconto abbonamento chiaro (10-15%) vs acquisto singolo.
- Consegna automatica a frequenza scelta dall'utente (ogni 4-6 settimane).
- Disdetta facile dichiarata subito → evita il "subscription trap" e i resi.
- Vendita sempre diretta dal sito: lì stanno margine e dati.

Fonti: nespresso.com/it/it/scopri-piani-easy · fourweekmba.com/dollar-shave-club-business-model
$md$, 'mattia', 'mattia'),

-- ---------- REGOLE ----------
('Direttiva tabacco (TPD)', 'Regole', $md$
Siamo dentro o fuori la direttiva europea sul tabacco?

## Cosa dice la TPD (Dir. 2014/40/UE, in Italia D.Lgs. 6/2016)
Copre: prodotti del tabacco, sigarette elettroniche (con e senza nicotina), e **"prodotti da fumo a base di erbe"**. La definizione di prodotto da fumo a base di erbe richiede la **combustione**.

## La nostra lettura (da far confermare)
Zen-Air non brucia niente, non ha liquido, non ha nicotina, non produce vapore → **con ogni probabilità è FUORI dalla TPD** e fuori dalla categoria sigarette elettroniche.

Restano comunque applicabili:
- **GPSR** (Reg. UE 2023/988) - sicurezza generale dei prodotti
- normativa sugli aromi, etichettatura
- valutazione caso per caso: uno Stato membro potrebbe trattarlo come "prodotto correlato" per la forma simile a una sigaretta.

## In Italia
Autorità di riferimento: **ADM** (Agenzia delle Dogane e dei Monopoli). Sentire anche la posizione del Ministero della Salute.

## Studi legali per un parere scritto
- **Keller and Heckman** (studio USA con sede a Bruxelles) - riferimento globale su TPD / tabacco / e-vapor a livello UE. Prima scelta.
- Italia (practice regulatory / consumer products / life sciences): Portolano Cavallo, Hogan Lovells Milano, DLA Piper, Osborne Clarke - per la lettura ADM + Ministero.
- **Costo stimato** di un memorandum "il prodotto rientra o no nella TPD, cosa serve per IT/DE": ~**3.000-8.000 euro**.

**Prossimo passo:** mandare a Keller and Heckman una descrizione di 1 pagina del prodotto e chiedere una stima di parcella per un parere di ammissibilità UE + IT.

Fonti: eur-lex.europa.eu (CELEX 32014L0040) · khlaw.com/practices/food/tobacco
$md$, 'mattia', 'mattia'),

-- ---------- PIANO ----------
('Il piano', 'Piano', $md$
Ordine delle cose. Prima quelle che possono far fallire l'idea.

1. **Il prodotto funziona** (mesi 1-4) - prototipo 3D ([[I prototipi]]), scelta degli aromi ([[Gli aromi]]), prova con 10-15 ex fumatori.
2. **Sicurezza e regole** (mesi 3-7) - test di sicurezza sugli aromi, parere legale ([[Direttiva tabacco (TPD)]]).
3. **Quanto costa davvero** (mesi 5-8) - preventivi veri per stampo ([[La capsula]]) e piccola produzione, prezzo finale.
4. **Marchio e sito** (mesi 7-10) - nome, logo, sito di vendita semplice, foto.
5. **Marketing leggero** (mesi 9-12) - passaparola, Instagram/TikTok, 2-3 creator, lista d'attesa.
6. **Lancio in Italia** (dal mese 12) - prima produzione, vendita dal sito ([[Il modello ad abbonamento]]), recensioni.

Cosa è ancora scoperto: [[Cosa resta da fare]].
$md$, 'mattia', 'mattia'),

('Cosa resta da fare', 'Piano', $md$
Le azioni che richiedono una persona o un file, non altra ricerca a tavolino.

## Prodotto
- [ ] **Comprare e provare** Honeyrose + un'altra marca. Foto di prodotto e pacchetto, giudizio onesto su gesto / sapore / durata / quanto "basta". (materiale d'acquisto: [[Dove si comprano in Italia]])
- [ ] Finire il **modello CAD** dello stick + capsula, poi caricarlo su jlc3dp.com per un preventivo reale ([[I prototipi]]).

## Preventivi da chiedere via email
- [ ] **Termoformatura capsula**: New Look Packaging + Euroform - costo stampo, prezzo/pezzo, MOQ, PLA sì/no ([[La capsula]]).
- [ ] **Test di sicurezza inalatoria**: Cultex Laboratories + Charles River - quote per screening ALI su 2-3 aromi ([[Gli aromi]]).
- [ ] **Parere legale**: Keller and Heckman - stima di parcella per un parere TPD IT/DE ([[Direttiva tabacco (TPD)]]).
- [ ] **Aromi**: contattare Flavourtec + 1-2 produttori francesi per schede tecniche e campioni.

## Team
- [ ] Lista di **10 ex fumatori** disposti a provare il prototipo e dare un giudizio onesto (contatti personali dei soci).
$md$, 'mattia', 'mattia');
