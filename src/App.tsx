import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { configOk, supabase } from "./supabase";
import * as api from "./api";
import type { Attachment, Member, Note } from "./api";
import { BrainGraph } from "./BrainGraph";

/* ordine e raggruppamento delle sezioni della Memoria */
const SECTION_ORDER = ["Cosa è", "Prodotto", "Concorrenti", "Mercato", "Regole", "Piano"];
const sectionRank = (s: string) => {
  const i = SECTION_ORDER.indexOf(s);
  return i === -1 ? 90 : i;
};

/* ---------------- toast ---------------- */
const ToastCtx = createContext<(m: string) => void>(() => {});
const useToast = () => useContext(ToastCtx);
function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const push = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {msg ? <div className="toast">{msg}</div> : null}
    </ToastCtx.Provider>
  );
}

/* ---------------- helpers ---------------- */
const NAMES: Record<string, string> = { mattia: "Mattia", diego: "Diego", pier: "Pier", system: "" };
const nameOf = (u: string) => NAMES[u] ?? u;
const initials = (n: string) => (n || "?").slice(0, 1).toUpperCase();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Errore imprevisto.");
function whenShort(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const n = new Date();
  const t = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === n.toDateString()) return "oggi " + t;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + " " + t;
}

/* markdown subset + [[wikilinks]] */
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function inlineMd(raw: string, titles: Set<string>) {
  let s = esc(raw);
  s = s.replace(/\[\[([^\]|]+)\]\]/g, (_m, t: string) => {
    const name = t.trim();
    const exists = titles.has(name.toLowerCase());
    return `<a class="wl${exists ? "" : " wl-new"}" data-note="${esc(name)}">${esc(name)}</a>`;
  });
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  s = s.replace(
    /(^|[\s(])(https?:\/\/[^\s)<]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
  );
  return s.replace(/\n/g, "<br>");
}
function renderMd(src: string, titles: Set<string>) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  let out = "";
  let i = 0;
  const para = (buf: string[]) => {
    if (buf.length) out += "<p>" + inlineMd(buf.join("\n"), titles) + "</p>";
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out += "<pre><code>" + esc(code.join("\n")) + "</code></pre>";
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const lv = h[1].length + 2;
      out += `<h${lv}>` + inlineMd(h[2], titles) + `</h${lv}>`;
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      out += "<blockquote>" + inlineMd(q.join("\n"), titles) + "</blockquote>";
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out += "<ul>" + items.map((t) => "<li>" + inlineMd(t, titles) + "</li>").join("") + "</ul>";
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      out += "<ol>" + items.map((t) => "<li>" + inlineMd(t, titles) + "</li>").join("") + "</ol>";
      continue;
    }
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,3}\s|>\s?|\s*[-*]\s+|\s*\d+\.\s+|```)/.test(lines[i])
    )
      buf.push(lines[i++]);
    para(buf);
  }
  return out || '<p class="hint">Nota vuota.</p>';
}

/* ---------------- root ---------------- */
export function App() {
  if (!configOk) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">
            <b>Base Zen-Air</b>
          </div>
          <p className="lead">
            Configurazione mancante. Imposta <code>VITE_SUPABASE_URL</code> e{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> e ricarica.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.getMe });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      qc.invalidateQueries({ queryKey: ["me"] });
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  if (me.isLoading) return <div className="spin" />;
  if (!me.data) return <Landing />;
  return <Dashboard user={me.data} />;
}

/* ---------------- landing + login ---------------- */
function Landing() {
  const [open, setOpen] = useState(false);
  return (
    <div className="landing">
      <div className="landing__bg" aria-hidden="true">
        <span className="breath" />
        <span className="breath breath--2" />
      </div>
      <div className="landing__inner">
        <div className="landing__mark">Zen&#8209;Air</div>
        <h1 className="landing__title">Lo spazio di lavoro del team.</h1>
        <p className="landing__sub">
          La memoria del progetto — prodotto, concorrenti, mercato, regole — organizzata in sezioni
          e collegata come una mappa. Per Mattia, Diego e Pier.
        </p>
        {open ? (
          <LoginCard />
        ) : (
          <button className="btn btn-primary landing__cta" onClick={() => setOpen(true)}>
            Entra
          </button>
        )}
        <a className="landing__deck" href="/deck.html" target="_blank" rel="noopener noreferrer">
          Vedi l&apos;investor deck &rarr;
        </a>
      </div>
    </div>
  );
}

function LoginCard() {
  const qc = useQueryClient();
  const [who, setWho] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const m = useMutation({
    mutationFn: (v: { who: string; pw: string }) => api.login(v.who, v.pw),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e) => setErr(errMsg(e)),
  });
  return (
    <div className="gate-card landing__login">
      <p className="lead" style={{ marginTop: 0 }}>
        Chi sei?
      </p>
      {err ? <div className="msg err">{err}</div> : null}
      <div className="who">
        {["mattia", "diego", "pier"].map((k) => (
          <button key={k} type="button" aria-pressed={who === k} onClick={() => { setWho(k); setErr(""); }}>
            <span className="ini">{initials(nameOf(k))}</span>
            {nameOf(k)}
          </button>
        ))}
      </div>
      <div className="field">
        <label>Password</label>
        <input
          type="password"
          value={pw}
          autoComplete="current-password"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && who && pw) m.mutate({ who, pw });
          }}
        />
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={m.isPending || !who || !pw}
        onClick={() => who && pw && m.mutate({ who, pw })}
      >
        {m.isPending ? "…" : "Entra"}
      </button>
    </div>
  );
}

/* ---------------- dashboard ---------------- */
type Tab = "memoria" | "brain";

function Dashboard({ user }: { user: Member }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("memoria");
  const [pwOpen, setPwOpen] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("zenair.tab");
      if (t === "brain" || t === "memoria") setTab(t);
    } catch {
      /* ignore */
    }
  }, []);
  const changeTab = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("zenair.tab", t);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const ch = supabase
      .channel("zenair-team")
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => {
        qc.invalidateQueries({ queryKey: ["notes"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  const goNote = (title: string) => {
    setOpenNote(title);
    changeTab("memoria");
  };

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <b>Base Zen-Air</b>
        </div>
        <div className="tabs">
          <button aria-current={tab === "memoria"} onClick={() => changeTab("memoria")}>
            Memoria
          </button>
          <button aria-current={tab === "brain"} onClick={() => changeTab("brain")}>
            Brain
          </button>
        </div>
        <div className="spacer" />
        <a className="btn btn-ghost btn-sm" href="/deck.html" target="_blank" rel="noopener noreferrer">
          Deck
        </a>
        <div className="whoami">
          <span className="ini">{initials(user.name)}</span>
          {user.name}
          {user.is_owner ? " · owner" : ""}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setPwOpen(true)}>
          Password
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => logout.mutate()}>
          Esci
        </button>
      </div>

      {tab === "brain" ? (
        <BrainTab onOpenNote={goNote} />
      ) : (
        <NotesTab user={user} openTitle={openNote} onConsumedOpen={() => setOpenNote(null)} />
      )}

      {pwOpen ? (
        <ChangePassword onClose={() => setPwOpen(false)} onDone={() => toast("Password aggiornata.")} />
      ) : null}
    </div>
  );
}

function ChangePassword({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const m = useMutation({
    mutationFn: () => api.changePassword(next),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => setErr(errMsg(e)),
  });
  return (
    <div className="gate" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 40 }}>
      <div className="gate-card">
        <div className="brand">
          <b>Cambia password</b>
        </div>
        <p className="lead">Almeno 6 caratteri.</p>
        {err ? <div className="msg err">{err}</div> : null}
        <div className="field">
          <label>Nuova password</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button className="btn btn-primary" disabled={m.isPending || next.length < 6} onClick={() => m.mutate()}>
            Salva
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- file helpers ---------------- */
function FileChips({ files, onRemove }: { files: Attachment[]; onRemove?: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="filechips">
      {files.map((f, i) => (
        <span key={i} className="filechip">
          {onRemove ? (
            <>
              📎 {f.name}
              <button type="button" onClick={() => onRemove(i)} aria-label="rimuovi">
                ×
              </button>
            </>
          ) : (
            <a href={f.url} target="_blank" rel="noopener noreferrer">
              📎 {f.name}
            </a>
          )}
        </span>
      ))}
    </div>
  );
}

function FilePicker({
  folder,
  id,
  onAdded,
}: {
  folder: "quests" | "notes";
  id: string;
  onAdded: (a: Attachment) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={"btn btn-sm" + (busy ? " is-busy" : "")} style={{ cursor: "pointer" }}>
      {busy ? "carico…" : "📎 Allega file"}
      <input
        type="file"
        hidden
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            toast("File troppo grande (max 10 MB).");
            return;
          }
          setBusy(true);
          try {
            onAdded(await api.uploadFile(folder, id, file));
          } catch (err) {
            toast(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

/* ---------------- brain ---------------- */
function BrainTab({ onOpenNote }: { onOpenNote: (title: string) => void }) {
  const notes = useQuery({ queryKey: ["notes"], queryFn: api.listNotes, refetchInterval: 30_000 });
  return (
    <div className="work single">
      <div className="pane pane-main">
        <div className="pane-head">
          <h2>Brain</h2>
        </div>
        <BrainGraph notes={notes.data ?? []} onOpen={onOpenNote} />
      </div>
    </div>
  );
}

/* ---------------- notes ---------------- */
function NotesTab({
  user,
  openTitle,
  onConsumedOpen,
}: {
  user: Member;
  openTitle: string | null;
  onConsumedOpen: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const notes = useQuery({ queryKey: ["notes"], queryFn: api.listNotes, refetchInterval: 25_000 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NoteDraft>({ title: "", section: "", body: "", files: [] });
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const all = notes.data ?? [];
  const titles = useMemo(() => new Set(all.map((n) => (n.title || "").trim().toLowerCase())), [all]);
  const active = activeId ? all.find((n) => n.id === activeId) ?? null : null;

  const allSections = useMemo(() => {
    const set = new Set<string>(all.map((n) => n.section || "Generale"));
    return [...set].sort((a, b) => sectionRank(a) - sectionRank(b) || a.localeCompare(b, "it"));
  }, [all]);

  const filtered = all.filter((n) => {
    if (sectionFilter && (n.section || "Generale") !== sectionFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q);
  });

  const groups = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of filtered) {
      const s = n.section || "Generale";
      const arr = m.get(s);
      if (arr) arr.push(n);
      else m.set(s, [n]);
    }
    return [...m.entries()]
      .sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]) || a[0].localeCompare(b[0], "it"))
      .map(
        ([s, ns]) =>
          [s, ns.sort((x, y) => (x.title || "").localeCompare(y.title || "", "it"))] as const,
      );
  }, [filtered]);

  const openOrCreate = useCallback(
    (title: string) => {
      const found = all.find((n) => (n.title || "").trim().toLowerCase() === title.trim().toLowerCase());
      if (found) {
        setActiveId(found.id);
        setEditing(false);
      } else {
        setDraft({ title: title.trim(), section: sectionFilter || "", body: "", files: [] });
        setActiveId(null);
        setEditing(true);
      }
    },
    [all, sectionFilter],
  );

  useEffect(() => {
    if (openTitle && all.length) {
      openOrCreate(openTitle);
      onConsumedOpen();
    }
  }, [openTitle, all.length, openOrCreate, onConsumedOpen]);

  const save = useMutation({
    mutationFn: (v: NoteDraft) => api.saveNote(user, v),
    onSuccess: (id) => {
      setEditing(false);
      setActiveId(id);
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast("Nota salvata.");
    },
    onError: (e) => toast(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      setActiveId(null);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast("Nota eliminata.");
    },
    onError: (e) => toast(errMsg(e)),
  });

  const detailOpen = editing || !!activeId;

  return (
    <div className={"work" + (detailOpen ? " detail-open" : "")}>
      <div className="pane pane-list">
        <div className="pane-head">
          <h2>Memoria</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setDraft({ title: "", section: sectionFilter || "", body: "", files: [] });
              setActiveId(null);
              setEditing(true);
            }}
          >
            + Nota
          </button>
        </div>
        <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nelle note…" />
        {allSections.length > 1 ? (
          <div className="filters">
            <button aria-pressed={sectionFilter === ""} onClick={() => setSectionFilter("")}>
              Tutte
            </button>
            {allSections.map((s) => (
              <button key={s} aria-pressed={sectionFilter === s} onClick={() => setSectionFilter(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {notes.isError ? (
          <div className="empty">Errore nel caricamento. Ricarica la pagina.</div>
        ) : !filtered.length ? (
          <div className="empty">
            {search || sectionFilter
              ? "Nessuna nota qui."
              : "Nessuna nota. Crea la prima. Collega le note con [[Titolo di un'altra nota]]."}
          </div>
        ) : (
          groups.map(([section, ns]) => (
            <div key={section} className="mem-group">
              <div className="mem-group__h">{section}</div>
              {ns.map((n) => {
                const prev = (n.body || "").replace(/[#>*`[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
                return (
                  <button
                    key={n.id}
                    className="card"
                    aria-current={activeId === n.id}
                    onClick={() => {
                      setActiveId(n.id);
                      setEditing(false);
                    }}
                  >
                    <span className="t">{n.title || "(senza titolo)"}</span>
                    {prev ? <span className="meta">{prev}</span> : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="pane pane-main">
        {editing ? (
          <NoteEditor
            draft={draft}
            setDraft={setDraft}
            saving={save.isPending}
            onSave={() => {
              if (!draft.title.trim()) {
                toast("Serve un titolo.");
                return;
              }
              save.mutate(draft);
            }}
            onCancel={() => {
              setEditing(false);
              if (!draft.id) setActiveId(null);
            }}
            onDelete={draft.id ? () => { if (confirm("Eliminare questa nota?")) del.mutate(draft.id!); } : undefined}
          />
        ) : active ? (
          <NoteView
            note={active}
            allNotes={all}
            titles={titles}
            onEdit={() => {
              setDraft({
                id: active.id,
                title: active.title,
                section: active.section,
                body: active.body,
                files: active.files,
              });
              setEditing(true);
            }}
            onOpenNote={openOrCreate}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="empty">Scegli una nota, o creane una nuova.</div>
        )}
      </div>
    </div>
  );
}

type NoteDraft = { id?: string; title: string; section: string; body: string; files: Attachment[] };

const SECTION_SUGGESTIONS = [...SECTION_ORDER, "Generale"];

function NoteEditor({
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: NoteDraft;
  setDraft: (d: NoteDraft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div>
      <button className="btn btn-ghost btn-sm back" onClick={onCancel}>
        ← Note
      </button>
      <input
        className="note-title-input"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Titolo della nota"
      />
      <div className="field" style={{ maxWidth: 260, marginBottom: ".7rem" }}>
        <label>Sezione</label>
        <input
          list="mem-sections"
          value={draft.section}
          onChange={(e) => setDraft({ ...draft, section: e.target.value })}
          placeholder="Es. Prodotto"
        />
        <datalist id="mem-sections">
          {SECTION_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <textarea
        className="note-editor"
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        placeholder="Scrivi qui. Markdown semplice. Collega altre note con [[Titolo]]."
      />
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", margin: ".6rem 0 .2rem" }}>
        <FilePicker
          folder="notes"
          id={draft.id ?? ""}
          onAdded={(a) => setDraft({ ...draft, files: [...draft.files, a] })}
        />
        <FileChips files={draft.files} onRemove={(i) => setDraft({ ...draft, files: draft.files.filter((_, k) => k !== i) })} />
      </div>
      <div className="detail-actions" style={{ marginTop: ".7rem" }}>
        <button className="btn btn-primary" disabled={saving} onClick={onSave}>
          Salva
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Annulla
        </button>
        {onDelete ? (
          <button className="btn btn-danger" onClick={onDelete}>
            Elimina
          </button>
        ) : null}
      </div>
      <p className="hint"># titolo · **grassetto** · - elenco · &gt; citazione · [[Altra nota]]</p>
    </div>
  );
}

function NoteView({
  note,
  allNotes,
  titles,
  onEdit,
  onOpenNote,
  onBack,
}: {
  note: Note;
  allNotes: Note[];
  titles: Set<string>;
  onEdit: () => void;
  onOpenNote: (t: string) => void;
  onBack: () => void;
}) {
  const html = useMemo(() => renderMd(note.body, titles), [note.body, titles]);
  const backlinks = allNotes.filter(
    (x) => x.id !== note.id && (x.body || "").toLowerCase().includes("[[" + (note.title || "").toLowerCase() + "]]"),
  );
  return (
    <div>
      <button className="btn btn-ghost btn-sm back" onClick={onBack}>
        ← Note
      </button>
      <div className="detail-top">
        <h2>{note.title || "(senza titolo)"}</h2>
        <button className="btn btn-sm" onClick={onEdit}>
          Modifica
        </button>
      </div>
      <div className="note-meta">
        <span className="tag open">{note.section || "Generale"}</span>
        {note.updated_by ? ` Ultimo aggiornamento di ${nameOf(note.updated_by)}` : ""}
        {note.updated_at ? ` · ${whenShort(note.updated_at)}` : ""}
      </div>
      <div
        className="note-view"
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.classList.contains("wl")) {
            e.preventDefault();
            onOpenNote(t.getAttribute("data-note") || "");
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {note.files.length ? (
        <div className="note-files">
          <h4>Allegati</h4>
          <FileChips files={note.files} />
        </div>
      ) : null}
      {backlinks.length ? (
        <div className="backlinks">
          <h4>Collegata da</h4>
          {backlinks.map((x) => (
            <a key={x.id} onClick={() => onOpenNote(x.title)}>
              {x.title}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
