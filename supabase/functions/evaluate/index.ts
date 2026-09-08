// Supabase Edge Function — valuta la risposta a una quest con Groq.
// NOTA: sul progetto è deployata col nome "hyper-processor" (nome auto-generato
// da Supabase). Il sito la chiama con quel nome. Secrets richiesti su Supabase:
//   GROQ_API_KEY  = la tua key groq.com
//   GROQ_MODEL    = openai/gpt-oss-20b  (o gpt-oss-120b per un giudice migliore)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { questTitle, questBrief, submissionText, links } = await req.json();
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return json({ error: "GROQ_API_KEY non configurata" }, 500);
    const model = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-20b";

    const sys =
      "Valuti la risposta di un collaboratore a un compito di ricerca per una startup. " +
      "Scala: 9-10 eccellente; 7-8 buona (3+ fonti con dati concreti); 5-6 parziale; " +
      "3-4 scarsa; 1-2 inutile o senza dati. Premia fonti e numeri concreti, non pretendere la perfezione. " +
      'Rispondi SOLO JSON italiano: {"voto":<intero 1-10>,"cosa_manca":"<max 50 parole>","come_migliorare":"<max 50 parole>"}.';

    const usr =
      `COMPITO: ${questTitle}\n\nCOSA CHIEDEVA:\n${questBrief || "-"}\n\n` +
      `RISPOSTA:\n${submissionText || "(vuota)"}\n\nLINK: ${links?.length ? links.join(", ") : "nessuno"}`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2500,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
      }),
    });

    if (!r.ok) return json({ error: `Groq ${r.status}: ${(await r.text()).slice(0, 400)}` }, 502);

    const data = await r.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";
    let p: { voto?: number; cosa_manca?: string; come_migliorare?: string };
    try { p = JSON.parse(content); } catch { p = { cosa_manca: content }; }
    const voto = Math.max(1, Math.min(10, Math.round(Number(p.voto) || 0))) || null;
    return json({
      voto,
      cosa_manca: String(p.cosa_manca ?? "").slice(0, 800),
      come_migliorare: String(p.come_migliorare ?? "").slice(0, 800),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
