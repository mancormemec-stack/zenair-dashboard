import { supabase, emailFor } from "./supabase";

export type Member = { username: string; name: string; is_owner: boolean };
export type Attachment = { name: string; url: string };
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
  files: Attachment[];
  created_at: string;
  eval_score: number | null;
  eval_missing: string | null;
  eval_improve: string | null;
};
export type Note = {
  id: string;
  title: string;
  section: string;
  body: string;
  files: Attachment[];
  created_by: string;
  updated_by: string;
  updated_at: string;
};
export type ActivityItem = {
  id: string;
  kind: "quest" | "note";
  at: string;
  who: string;
  text: string;
  targetId: string;
  targetTitle: string;
};

const nowIso = () => new Date().toISOString();
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asFiles = (v: unknown): Attachment[] =>
  asArray(v).filter(
    (x): x is Attachment =>
      !!x && typeof x === "object" && typeof (x as Attachment).url === "string",
  );

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

/* ---------------- file ---------------- */

export async function uploadFile(folder: "quests" | "notes", id: string, file: File): Promise<Attachment> {
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  const path = `${folder}/${id || "nuova"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from("files").upload(path, file, { upsert: false });
  if (error) throw new Error("Upload fallito: " + error.message);
  const { data } = supabase.storage.from("files").getPublicUrl(path);
  return { name: file.name, url: data.publicUrl };
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
  return (data ?? []).map((m) => {
    const row = m as Record<string, unknown>;
    return {
      ...(m as QuestMessage),
      links: asArray(row.links) as string[],
      files: asFiles(row.files),
    };
  });
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
  await addMessage(data.id, me.username, "status", `${me.name} ha creato la quest.`, [], []);
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
  files: Attachment[],
): Promise<string> {
  // include `files` solo se c'è qualcosa: così il commento normale funziona
  // anche se la colonna `files` non è ancora stata aggiunta (upgrade3.sql).
  const payload: Record<string, unknown> = { quest_id: questId, author, kind, text, links };
  if (files.length) payload.files = files;
  const { data, error } = await supabase
    .from("quest_messages")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("quests").update({ updated_at: nowIso() }).eq("id", questId);
  return data.id as string;
}

export async function postMessage(
  me: Member,
  v: {
    questId: string;
    kind: "comment" | "submission";
    text: string;
    links: string[];
    files: Attachment[];
  },
): Promise<void> {
  const links = v.links.map((l) => l.trim()).filter(Boolean);
  if (!v.text.trim() && !links.length && !v.files.length) throw new Error("Messaggio vuoto.");
  const msgId = await addMessage(v.questId, me.username, v.kind, v.text.trim(), links, v.files);
  if (v.kind === "submission") {
    if (!me.is_owner) await setStatus(me, { questId: v.questId, status: "inviata" });
    try {
      await evaluateMessage(v.questId, msgId);
    } catch {
      /* la valutazione è opzionale */
    }
  }
}

/** Chiama la Edge Function e salva il risultato sul messaggio. */
export async function evaluateMessage(questId: string, messageId: string): Promise<void> {
  const [{ data: quest }, { data: msg }] = await Promise.all([
    supabase.from("quests").select("title, brief").eq("id", questId).maybeSingle(),
    supabase.from("quest_messages").select("text, links").eq("id", messageId).maybeSingle(),
  ]);
  if (!quest || !msg) throw new Error("Dati non trovati.");

  const { data, error } = await supabase.functions.invoke("hyper-processor", {
    body: {
      questTitle: quest.title,
      questBrief: quest.brief,
      submissionText: msg.text,
      links: asArray(msg.links),
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
  if (note) await addMessage(v.questId, "system", "status", note, [], []);
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
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((n) => {
    const row = n as Record<string, unknown>;
    return {
      ...(n as Note),
      section: (typeof row.section === "string" && row.section.trim()) || "Generale",
      files: asFiles(row.files),
    };
  });
}

export async function saveNote(
  me: Member,
  v: { id?: string; title: string; section: string; body: string; files: Attachment[] },
): Promise<string> {
  const section = v.section.trim() || "Generale";
  if (v.id) {
    const { error } = await supabase
      .from("notes")
      .update({
        title: v.title.trim(),
        section,
        body: v.body,
        files: v.files,
        updated_by: me.username,
        updated_at: nowIso(),
      })
      .eq("id", v.id);
    if (error) throw new Error(error.message);
    return v.id;
  }
  const { data, error } = await supabase
    .from("notes")
    .insert({
      title: v.title.trim(),
      section,
      body: v.body,
      files: v.files,
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

/* ---------------- bacheca ---------------- */

export async function recentActivity(): Promise<ActivityItem[]> {
  const [{ data: msgs }, { data: notes }] = await Promise.all([
    supabase
      .from("quest_messages")
      .select("id, author, kind, text, created_at, quest_id, quests(title)")
      .neq("kind", "status")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("notes")
      .select("id, title, updated_by, updated_at")
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  const items: ActivityItem[] = [];
  for (const m of msgs ?? []) {
    const row = m as Record<string, unknown>;
    const q = row.quests as { title?: string } | { title?: string }[] | null;
    const title = Array.isArray(q) ? q[0]?.title : q?.title;
    items.push({
      id: "m" + String(row.id),
      kind: "quest",
      at: String(row.created_at),
      who: String(row.author),
      text: row.kind === "submission" ? "ha inviato un risultato" : "ha commentato",
      targetId: String(row.quest_id),
      targetTitle: title ?? "una quest",
    });
  }
  for (const n of notes ?? []) {
    const row = n as Record<string, unknown>;
    items.push({
      id: "n" + String(row.id),
      kind: "note",
      at: String(row.updated_at),
      who: String(row.updated_by),
      text: "ha aggiornato la nota",
      targetId: String(row.id),
      targetTitle: String(row.title),
    });
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 14);
}
