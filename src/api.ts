import { supabase, emailFor } from "./supabase";

export type Member = { username: string; name: string; is_owner: boolean };
export type Quest = {
  id: string;
  title: string;
  brief: string;
  assignee: string;
  status: string;
  due: string;
  difficulty: string; // 'basso' | 'medio' | 'alto'
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type QuestMessage = {
  id: string;
  quest_id: string;
  author: string;
  kind: string;
  text: string;
  links: string[];
  created_at: string;
  eval_score: number | null;
  eval_missing: string | null;
  eval_improve: string | null;
};
export type Note = {
  id: string;
  title: string;
  body: string;
  created_by: string;
  updated_by: string;
  updated_at: string;
};

const nowIso = () => new Date().toISOString();

/* ---------------- auth ---------------- */

export async function getMe(): Promise<Member | null> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;
  const { data, error } = await supabase
    .from("members")
    .select("username, name, is_owner")
    .eq("id", sess.session.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Member;
}

export async function login(usernameKey: string, password: string): Promise<void> {
  const email = emailFor(usernameKey);
  if (!email) throw new Error("Utente sconosciuto.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Utente o password non validi.");
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function changePassword(next: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new Error(error.message);
}

/* ---------------- quests ---------------- */

export async function listQuests(me: Member): Promise<Quest[]> {
  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Quest[];
  if (me.is_owner) return rows;
  return rows.filter((q) => q.assignee === me.username || q.assignee === "both");
}

export async function questThread(questId: string): Promise<QuestMessage[]> {
  const { data, error } = await supabase
    .from("quest_messages")
    .select("*")
    .eq("quest_id", questId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    ...(m as Omit<QuestMessage, "links">),
    links: Array.isArray((m as { links: unknown }).links)
      ? ((m as { links: string[] }).links)
      : [],
  }));
}

export async function createQuest(
  me: Member,
  v: { title: string; brief: string; assignee: string; due: string; difficulty: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("quests")
    .insert({
      title: v.title.trim(),
      brief: v.brief.trim(),
      assignee: v.assignee,
      due: v.due.trim(),
      difficulty: v.difficulty,
      status: "aperta",
      created_by: me.username,
      updated_at: nowIso(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await addMessage(data.id, me.username, "status", `${me.name} ha creato la quest.`, []);
  return data.id as string;
}

export async function deleteQuest(questId: string): Promise<void> {
  const { error } = await supabase.from("quests").delete().eq("id", questId);
  if (error) throw new Error(error.message);
}

async function addMessage(
  questId: string,
  author: string,
  kind: string,
  text: string,
  links: string[],
): Promise<string> {
  const { data, error } = await supabase
    .from("quest_messages")
    .insert({ quest_id: questId, author, kind, text, links })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("quests").update({ updated_at: nowIso() }).eq("id", questId);
  return data.id as string;
}

export async function postMessage(
  me: Member,
  v: { questId: string; kind: "comment" | "submission"; text: string; links: string[] },
): Promise<void> {
  const links = v.links.map((l) => l.trim()).filter(Boolean);
  if (!v.text.trim() && !links.length) throw new Error("Messaggio vuoto.");
  const msgId = await addMessage(v.questId, me.username, v.kind, v.text.trim(), links);
  if (v.kind === "submission") {
    if (!me.is_owner) await setStatus(me, { questId: v.questId, status: "inviata" });
    // valutazione AI in background: se fallisce, la quest resta comunque inviata
    try {
      await evaluateMessage(v.questId, msgId);
    } catch {
      /* la valutazione è opzionale */
    }
  }
}

/** Chiama la Edge Function "evaluate" e salva il risultato sul messaggio. */
export async function evaluateMessage(questId: string, messageId: string): Promise<void> {
  const [{ data: quest }, { data: msg }] = await Promise.all([
    supabase.from("quests").select("title, brief").eq("id", questId).maybeSingle(),
    supabase.from("quest_messages").select("text, links").eq("id", messageId).maybeSingle(),
  ]);
  if (!quest || !msg) throw new Error("Dati non trovati.");

  const { data, error } = await supabase.functions.invoke("evaluate", {
    body: {
      questTitle: quest.title,
      questBrief: quest.brief,
      submissionText: msg.text,
      links: Array.isArray(msg.links) ? msg.links : [],
    },
  });
  if (error) throw new Error(error.message);
  const res = data as { voto?: number | null; cosa_manca?: string; come_migliorare?: string; error?: string };
  if (res.error) throw new Error(res.error);

  const { error: upErr } = await supabase
    .from("quest_messages")
    .update({
      eval_score: res.voto ?? null,
      eval_missing: res.cosa_manca ?? "",
      eval_improve: res.come_migliorare ?? "",
    })
    .eq("id", messageId);
  if (upErr) throw new Error(upErr.message);
}

export async function setStatus(
  me: Member,
  v: { questId: string; status: string; note?: string },
): Promise<void> {
  const { error } = await supabase
    .from("quests")
    .update({ status: v.status, updated_at: nowIso() })
    .eq("id", v.questId);
  if (error) throw new Error(error.message);
  const note = v.note?.trim() || defaultNote(v.status, me.name);
  if (note) await addMessage(v.questId, "system", "status", note, []);
}

function defaultNote(status: string, name: string): string {
  switch (status) {
    case "in-corso":
      return `${name} ha iniziato a lavorarci.`;
    case "inviata":
      return `${name} ha inviato un risultato.`;
    case "approvata":
      return `${name} ha approvato.`;
    case "da-rifare":
      return `${name} ha rimandato indietro.`;
    default:
      return `${name} ha aggiornato la quest.`;
  }
}

/* ---------------- notes ---------------- */

export async function listNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, body, created_by, updated_by, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Note[];
}

export async function saveNote(
  me: Member,
  v: { id?: string; title: string; body: string },
): Promise<string> {
  if (v.id) {
    const { error } = await supabase
      .from("notes")
      .update({ title: v.title.trim(), body: v.body, updated_by: me.username, updated_at: nowIso() })
      .eq("id", v.id);
    if (error) throw new Error(error.message);
    return v.id;
  }
  const { data, error } = await supabase
    .from("notes")
    .insert({
      title: v.title.trim(),
      body: v.body,
      created_by: me.username,
      updated_by: me.username,
      updated_at: nowIso(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
