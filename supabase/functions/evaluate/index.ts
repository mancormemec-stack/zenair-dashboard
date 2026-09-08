// Supabase Edge Function "evaluate"
// Valuta la risposta a una quest con un modello AI (Groq) e restituisce
// voto 1-10 + cosa manca + come migliorare.
//
// DEPLOY (dashboard, senza CLI):
//   Supabase -> Edge Functions -> "Deploy a new function" -> nome: evaluate
//   -> incolla questo file -> Deploy.
//   Poi: Edge Functions -> Secrets -> aggiungi  GROQ_API_KEY = <la tua key groq>
//
// Il client la chiama con supabase.functions.invoke("evaluate", { body: {...} }).
// Supabase verifica da solo che chi chiama sia loggato.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { questTitle, questBrief, submissionText, links } = await req.json();
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) {
      return json({ error: "GROQ_API_KEY non configurata nei Secrets" }, 500);
    }

    const sys =
      'Sei un valutatore severo ma costruttivo. Valuti la risposta di un collaboratore ' +
      'a un compito di ricerca per una startup. Dai un voto da 1 a 10 (10 = risposta ' +
      'completa, precisa, con fonti; 1 = inutile). Poi spieghi cosa manca e come migliorare. ' +
      'Rispondi SOLO con JSON valido in italiano: ' +
      '{"voto": <intero 1-10>, "cosa_manca": "<max 60 parole>", "come_migliorare": "<max 60 parole>"}.';

    const user =
      `COMPITO: ${questTitle}\n\n` +
      `COSA CHIEDEVA:\n${questBrief || "(nessun dettaglio)"}\n\n` +
      `RISPOSTA CONSEGNATA:\n${submissionText || "(vuota)"}\n\n` +
      `LINK ALLEGATI: ${(links && links.length ? links.join(", ") : "nessuno")}`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return json({ error: `Groq ${r.status}: ${t.slice(0, 300)}` }, 502);
    }

    const data = await r.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { voto?: number; cosa_manca?: string; come_migliorare?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { voto: undefined, cosa_manca: content, come_migliorare: "" };
    }

    const voto = Math.max(1, Math.min(10, Math.round(Number(parsed.voto) || 0))) || null;
    return json({
      voto,
      cosa_manca: String(parsed.cosa_manca ?? "").slice(0, 800),
      come_migliorare: String(parsed.come_migliorare ?? "").slice(0, 800),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
