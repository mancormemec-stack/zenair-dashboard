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
import type { Attachment, Member, Note, QuestMessage } from "./api";
import { BrainGraph } from "./BrainGraph";

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
const STATUS: Record<string, { label: string; cls: string }> = {
  aperta: { label: "aperta", cls: "open" },
  "in-corso": { label: "in corso", cls: "doing" },
  inviata: { label: "inviata", cls: "sent" },
  approvata: { label: "approvata", cls: "ok" },
  "da-rifare": { label: "da rifare", cls: "redo" },
};
const DIFF: Record<string, { label: string; cls: string }> = {
  basso: { label: "basso", cls: "open" },
  medio: { label: "medio", cls: "doing" },
  alto: { label: "alto", cls: "redo" },
};
const NAMES: Record<string, string> = { mattia: "Mattia", diego: "Diego", pier: "Pier", system: "" };
const nameOf = (u: string) => NAMES[u] ?? u;
const assigneeLabel = (a: string) => (a === "both" ? "Diego e Pier" : nameOf(a));
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
          Quest di ricerca, valutate dall&apos;AI. La memoria del progetto, collegata come una mappa.
          Per Mattia, Diego e Pier.
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
type Tab = "bacheca" | "quest" | "brain" | "memoria";

function Dashboard({ user }: { user: Member }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("bacheca");
  const [pwOpen, setPwOpen] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [openQuestId, setOpenQuestId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("zenair.tab");
      if (t === "bacheca" || t === "quest" || t === "brain" || t === "memoria") setTab(t);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "quests" }, () => {
        qc.invalidateQueries({ queryKey: ["quests"] });
        qc.invalidateQueries({ queryKey: ["quest"] });
        qc.invalidateQueries({ queryKey: ["activity"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quest_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["quest"] });
        qc.invalidateQueries({ queryKey: ["quests"] });
        qc.invalidateQueries({ queryKey: ["activity"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => {
        qc.invalidateQueries({ queryKey: ["notes"] });
        qc.invalidateQueries({ queryKey: ["activity"] });
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
  const goQuest = (id: string) => {
    setOpenQuestId(id);
    changeTab("quest");
  };

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <b>Base Zen-Air</b>
        </div>
        <div className="tabs">
          <button aria-current={tab === "bacheca"} onClick={() => changeTab("bacheca")}>
            Bacheca
          </button>
          <button aria-current={tab === "quest"} onClick={() => changeTab("quest")}>
            Quest
          </button>
          <button aria-current={tab === "brain"} onClick={() => changeTab("brain")}>
            Brain
          </button>
          <button aria-current={tab === "memoria"} onClick={() => changeTab("memoria")}>
            Memoria
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

      {tab === "bacheca" ? (
        <BachecaTab user={user} onOpenQuest={goQuest} onOpenNote={goNote} />
      ) : tab === "quest" ? (
        <QuestTab
          user={user}
          openId={openQuestId}
          onConsumedOpen={() => setOpenQuestId(null)}
        />
      ) : tab === "brain" ? (
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

/* ---------------- bacheca ---------------- */
function BachecaTab({
  user,
  onOpenQuest,
  onOpenNote,
}: {
  user: Member;
  onOpenQuest: (id: string) => void;
  onOpenNote: (title: string) => void;
}) {
  const quests = useQuery({
    queryKey: ["quests"],
    queryFn: () => api.listQuests(user),
    refetchInterval: 20_000,
  });
  const activity = useQuery({
    queryKey: ["activity"],
    queryFn: api.recentActivity,
    refetchInterval: 20_000,
  });

  const qs = quests.data ?? [];
  const mine = user.is_owner
    ? qs.filter((q) => q.status === "inviata")
    : qs.filter((q) => q.status === "aperta" || q.status === "da-rifare");
  const mineTitle = user.is_owner ? "Risultati da controllare" : "Le tue quest da fare";

  return (
    <div className="work single">
      <div className="pane pane-main bacheca">
        <h1 className="bacheca__hi">Ciao, {user.name}.</h1>

        <section>
          <h3 className="bacheca__h">
            {mineTitle}
            {mine.length ? <span className="tally">{mine.length}</span> : null}
          </h3>
          {!qs.length && quests.isLoading ? (
            <div className="spin" />
          ) : !mine.length ? (
            <p className="hint" style={{ marginTop: 0 }}>
              {user.is_owner ? "Niente in attesa. Tutto sotto controllo." : "Niente da fare adesso. 🎉"}
            </p>
          ) : (
            <div className="bcards">
              {mine.map((q) => {
                const df = DIFF[q.difficulty] ?? DIFF.medio;
                return (
                  <button key={q.id} className="card card--todo" onClick={() => onOpenQuest(q.id)}>
                    <span className="t">{q.title}</span>
                    <span className="meta">
                      <span className={"tag " + df.cls}>{df.label}</span>
                      {q.status === "da-rifare" ? <span className="tag redo">da rifare</span> : null}
                      {user.is_owner ? <span>{assigneeLabel(q.assignee)}</span> : null}
                      <span>· {whenShort(q.updated_at)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h3 className="bacheca__h">Novità recenti</h3>
          {activity.isLoading ? (
            <div className="spin" />
          ) : !activity.data?.length ? (
            <p className="hint" style={{ marginTop: 0 }}>
              Ancora niente. Le attività del team compaiono qui.
            </p>
          ) : (
            <ul className="feed">
              {activity.data.map((a) => (
                <li key={a.id}>
                  <button
                    className="linkish"
                    onClick={() =>
                      a.kind === "quest" ? onOpenQuest(a.targetId) : onOpenNote(a.targetTitle)
                    }
                  >
                    <b>{nameOf(a.who)}</b> {a.text}{" "}
                    <span className="feed__target">«{a.targetTitle}»</span>
                  </button>
                  <span className="feed__when">{whenShort(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
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

/* ---------------- quests ---------------- */
function QuestTab({
  user,
  openId,
  onConsumedOpen,
}: {
  user: Member;
  openId: string | null;
  onConsumedOpen: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"tutte" | "da-fare" | "attesa" | "chiuse">(
    user.is_owner ? "tutte" : "da-fare",
  );

  useEffect(() => {
    if (openId) {
      setActiveId(openId);
      setCreating(false);
      setFilter("tutte");
      onConsumedOpen();
    }
  }, [openId, onConsumedOpen]);

  const quests = useQuery({
    queryKey: ["quests"],
    queryFn: () => api.listQuests(user),
    refetchInterval: 20_000,
  });

  const all = quests.data ?? [];
  const todoCount = user.is_owner
    ? 0
    : all.filter((q) => q.status === "aperta" || q.status === "da-rifare").length;
  const list = all.filter((q) => {
    if (filter === "tutte") return true;
    if (filter === "da-fare") return ["aperta", "in-corso", "da-rifare"].includes(q.status);
    if (filter === "attesa") return q.status === "inviata";
    if (filter === "chiuse") return q.status === "approvata";
    return true;
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quests"] });
    if (activeId) qc.invalidateQueries({ queryKey: ["quest", activeId] });
  };
  const detailOpen = !!activeId || creating;

  return (
    <div className={"work" + (detailOpen ? " detail-open" : "")}>
      <div className="pane pane-list">
        <div className="pane-head">
          <h2>
            Quest
            {!user.is_owner && todoCount > 0 ? <span className="tally">{todoCount} da fare</span> : null}
          </h2>
          {user.is_owner ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setCreating(true);
                setActiveId(null);
              }}
            >
              + Nuova
            </button>
          ) : null}
        </div>
        {!user.is_owner ? (
          <div className="qintro">
            Ciao <b>{user.name}</b>. Qui sotto ci sono le ricerche che Mattia ti ha assegnato.
            Aprine una, leggi cosa serve, cerca, poi scrivi cosa hai trovato e premi{" "}
            <b>«Invia come risultato»</b>. L&apos;AI ti dà subito un voto e i consigli per migliorare.
          </div>
        ) : null}
        <div className="filters">
          {(
            [
              ["tutte", "Tutte"],
              ["da-fare", "Da fare"],
              ["attesa", "In attesa"],
              ["chiuse", "Chiuse"],
            ] as const
          ).map(([k, lbl]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {lbl}
            </button>
          ))}
        </div>
        {quests.isError ? (
          <div className="empty">Errore nel caricamento. Ricarica la pagina.</div>
        ) : !list.length ? (
          <div className="empty">
            {user.is_owner
              ? "Nessuna quest. Creane una per Diego o Pier."
              : "Nessuna quest per te al momento."}
          </div>
        ) : (
          list.map((q) => {
            const st = STATUS[q.status] ?? STATUS.aperta;
            const df = DIFF[q.difficulty] ?? DIFF.medio;
            const todo = !user.is_owner && (q.status === "aperta" || q.status === "da-rifare");
            const stLabel = !user.is_owner && q.status === "aperta" ? "da fare" : st.label;
            return (
              <button
                key={q.id}
                className={"card" + (todo ? " card--todo" : "")}
                aria-current={activeId === q.id}
                onClick={() => {
                  setActiveId(q.id);
                  setCreating(false);
                }}
              >
                <span className="t">{q.title}</span>
                <span className="meta">
                  <span className={"tag " + st.cls}>{stLabel}</span>
                  <span className={"tag " + df.cls}>{df.label}</span>
                  {user.is_owner ? <span>{assigneeLabel(q.assignee)}</span> : null}
                  <span>· {whenShort(q.updated_at)}</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="pane pane-main">
        {creating && user.is_owner ? (
          <QuestCreate
            user={user}
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              setActiveId(id);
              refresh();
              toast("Quest creata.");
            }}
          />
        ) : activeId ? (
          <QuestDetail
            key={activeId}
            questId={activeId}
            user={user}
            onBack={() => setActiveId(null)}
            onChange={refresh}
            onDeleted={() => {
              setActiveId(null);
              refresh();
              toast("Quest eliminata.");
            }}
          />
        ) : (
          <div className="empty">
            Scegli una quest dall&apos;elenco{user.is_owner ? ", o creane una nuova." : "."}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestCreate({
  user,
  onCancel,
  onCreated,
}: {
  user: Member;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [assignee, setAssignee] = useState<"diego" | "pier" | "both">("diego");
  const [difficulty, setDifficulty] = useState<"basso" | "medio" | "alto">("medio");
  const [due, setDue] = useState("");
  const m = useMutation({
    mutationFn: () => api.createQuest(user, { title, brief, assignee, due, difficulty }),
    onSuccess: (id) => onCreated(id),
    onError: (e) => toast(errMsg(e)),
  });
  return (
    <div className="note-view">
      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Nuova quest</h2>
      <div className="field">
        <label>Titolo</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Trovare 3 fornitori di fibre" />
      </div>
      <div className="field">
        <label>Cosa serve / dove cercare</label>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Dettagli, link utili, cosa ti serve indietro…" />
      </div>
      <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Assegnata a</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value as "diego" | "pier" | "both")}>
            <option value="diego">Diego</option>
            <option value="pier">Pier</option>
            <option value="both">Diego e Pier</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Livello</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as "basso" | "medio" | "alto")}>
            <option value="basso">Basso</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Scadenza (facoltativa)</label>
        <input value={due} onChange={(e) => setDue(e.target.value)} placeholder="Es. entro venerdì" />
      </div>
      <div className="detail-actions">
        <button className="btn btn-primary" disabled={m.isPending || !title.trim()} onClick={() => m.mutate()}>
          Crea quest
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  );
}

function EvalCard({ m }: { m: QuestMessage }) {
  if (m.eval_score == null && !m.eval_missing) return null;
  const score = m.eval_score;
  const cls = score == null ? "" : score >= 7 ? "ok" : score >= 4 ? "doing" : "redo";
  return (
    <div className="eval">
      <div className="eval__head">
        <span>Valutazione AI</span>
        {score != null ? <span className={"tag " + cls}>{score}/10</span> : null}
      </div>
      {m.eval_missing ? (
        <p>
          <b>Cosa manca:</b> {m.eval_missing}
        </p>
      ) : null}
      {m.eval_improve ? (
        <p>
          <b>Come migliorare:</b> {m.eval_improve}
        </p>
      ) : null}
    </div>
  );
}

function QuestDetail({
  questId,
  user,
  onBack,
  onChange,
  onDeleted,
}: {
  questId: string;
  user: Member;
  onBack: () => void;
  onChange: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const detail = useQuery({
    queryKey: ["quest", questId],
    queryFn: async () => {
      const all = await api.listQuests(user);
      const quest = all.find((q) => q.id === questId) ?? null;
      const thread = await api.questThread(questId);
      return { quest, thread };
    },
    refetchInterval: 15_000,
  });
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);

  const post = useMutation({
    mutationFn: (kind: "comment" | "submission") =>
      api.postMessage(user, {
        questId,
        kind,
        text,
        links: link.trim() ? [link.trim()] : [],
        files,
      }),
    onSuccess: () => {
      setText("");
      setLink("");
      setFiles([]);
      detail.refetch();
      onChange();
    },
    onError: (e) => toast(errMsg(e)),
  });
  const status = useMutation({
    mutationFn: (v: { status: string; note?: string }) => api.setStatus(user, { questId, ...v }),
    onSuccess: () => {
      detail.refetch();
      onChange();
    },
    onError: (e) => toast(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () => api.deleteQuest(questId),
    onSuccess: onDeleted,
    onError: (e) => toast(errMsg(e)),
  });
  const reval = useMutation({
    mutationFn: (messageId: string) => api.evaluateMessage(questId, messageId),
    onSuccess: () => {
      detail.refetch();
      toast("Valutazione aggiornata.");
    },
    onError: (e) => toast(errMsg(e)),
  });

  if (detail.isLoading) return <div className="spin" />;
  const quest = detail.data?.quest;
  const thread = detail.data?.thread ?? [];
  if (!quest) return <div className="empty">Quest non disponibile.</div>;
  const st = STATUS[quest.status] ?? STATUS.aperta;
  const df = DIFF[quest.difficulty] ?? DIFF.medio;
  const isMember = !user.is_owner;

  return (
    <div>
      <button className="btn btn-ghost btn-sm back" onClick={onBack}>
        ← Tutte
      </button>
      <div className="detail-top">
        <h2>{quest.title}</h2>
        <span className={"tag " + st.cls}>{st.label}</span>
        <span className={"tag " + df.cls}>livello {df.label}</span>
      </div>
      <div className="note-meta">
        Per {assigneeLabel(quest.assignee)} · creata da {nameOf(quest.created_by)}
        {quest.due ? ` · scadenza: ${quest.due}` : ""}
      </div>
      {quest.brief ? <div className="brief">{quest.brief}</div> : null}

      {isMember ? (
        <div className="steps-hint">
          {quest.status === "da-rifare"
            ? "Mattia ha rimandato indietro — leggi il suo commento qui sotto e riprova."
            : quest.status === "inviata"
              ? "Risultato inviato. Aspetta il giudizio di Mattia."
              : quest.status === "approvata"
                ? "Approvata ✓ — niente da fare qui."
                : "Cerca quello che serve, poi scrivi qui sotto cosa hai trovato (più eventuali link) e premi «Invia come risultato»."}
        </div>
      ) : null}

      <div className="detail-actions">
        {isMember && quest.status === "aperta" ? (
          <button className="btn btn-sm" onClick={() => status.mutate({ status: "in-corso" })}>
            Segna come «in corso»
          </button>
        ) : null}
        {user.is_owner && quest.status === "inviata" ? (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => status.mutate({ status: "approvata" })}>
              Approva
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (!text.trim()) {
                  toast("Scrivi cosa manca prima di rimandare indietro.");
                  return;
                }
                post.mutateAsync("comment").then(() => status.mutate({ status: "da-rifare" }));
              }}
            >
              Rimanda indietro
            </button>
          </>
        ) : null}
        {user.is_owner ? (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (confirm("Eliminare questa quest?")) del.mutate();
            }}
          >
            Elimina
          </button>
        ) : null}
      </div>

      <div className="thread">
        {thread.length === 0 ? (
          <div className="hint">Ancora nessun messaggio.</div>
        ) : (
          thread.map((m) =>
            m.kind === "status" ? (
              <div key={m.id} className="sysline">
                <span>
                  {m.text} · {whenShort(m.created_at)}
                </span>
              </div>
            ) : (
              <div key={m.id}>
                <div className={"bubble" + (m.kind === "submission" ? " sub" : "")}>
                  <div className="bh">
                    <b>{nameOf(m.author)}</b>
                    {m.kind === "submission" ? <span className="tag sent">risultato</span> : null}
                    <span>· {whenShort(m.created_at)}</span>
                  </div>
                  {m.text ? <div className="body">{m.text}</div> : null}
                  {m.links.length ? (
                    <div className="links">
                      {m.links.map((l, i) => (
                        <a key={i} href={l} target="_blank" rel="noopener noreferrer">
                          {l}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <FileChips files={m.files} />
                </div>
                {m.kind === "submission" ? (
                  <>
                    <EvalCard m={m} />
                    <button
                      className="linkish"
                      disabled={reval.isPending}
                      onClick={() => reval.mutate(m.id)}
                      style={{ marginTop: ".2rem" }}
                    >
                      {reval.isPending
                        ? "valuto…"
                        : m.eval_score == null
                          ? "Valuta con AI"
                          : "Rivaluta con AI"}
                    </button>
                  </>
                ) : null}
              </div>
            ),
          )
        )}
      </div>

      <div className="compose">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isMember ? "Scrivi cosa hai trovato, o un aggiornamento…" : "Scrivi un commento o istruzioni…"}
        />
        <input className="lk" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (facoltativo)" />
        <FileChips files={files} onRemove={(i) => setFiles(files.filter((_, k) => k !== i))} />
        <div className="row">
          <FilePicker folder="quests" id={questId} onAdded={(a) => setFiles((f) => [...f, a])} />
          <button
            className="btn btn-sm"
            disabled={post.isPending || (!text.trim() && !link.trim() && !files.length)}
            onClick={() => post.mutate("comment")}
          >
            Commenta
          </button>
          {isMember ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={post.isPending || (!text.trim() && !files.length)}
              onClick={() => post.mutate("submission")}
            >
              {post.isPending ? "invio + valutazione…" : "Invia come risultato"}
            </button>
          ) : null}
        </div>
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
  const [draft, setDraft] = useState<NoteDraft>({ title: "", body: "", files: [] });
  const [search, setSearch] = useState("");

  const all = notes.data ?? [];
  const titles = useMemo(() => new Set(all.map((n) => (n.title || "").trim().toLowerCase())), [all]);
  const active = activeId ? all.find((n) => n.id === activeId) ?? null : null;
  const filtered = all.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q);
  });

  const openOrCreate = useCallback(
    (title: string) => {
      const found = all.find((n) => (n.title || "").trim().toLowerCase() === title.trim().toLowerCase());
      if (found) {
        setActiveId(found.id);
        setEditing(false);
      } else {
        setDraft({ title: title.trim(), body: "", files: [] });
        setActiveId(null);
        setEditing(true);
      }
    },
    [all],
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
              setDraft({ title: "", body: "", files: [] });
              setActiveId(null);
              setEditing(true);
            }}
          >
            + Nota
          </button>
        </div>
        <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nelle note…" />
        {notes.isError ? (
          <div className="empty">Errore nel caricamento. Ricarica la pagina.</div>
        ) : !filtered.length ? (
          <div className="empty">
            {search
              ? "Nessuna nota trovata."
              : "Nessuna nota. Crea la prima. Collega le note con [[Titolo di un'altra nota]]."}
          </div>
        ) : (
          filtered.map((n) => {
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
          })
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
              setDraft({ id: active.id, title: active.title, body: active.body, files: active.files });
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

type NoteDraft = { id?: string; title: string; body: string; files: Attachment[] };

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
        {note.updated_by ? `Ultimo aggiornamento di ${nameOf(note.updated_by)}` : ""}
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
