import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "./api";

type N = { id: string; title: string; deg: number; x: number; y: number; vx: number; vy: number; fixed: boolean };
type L = { a: string; b: string };

function buildGraph(notes: Note[]): { nodes: N[]; links: L[] } {
  const byTitle = new Map<string, Note>();
  notes.forEach((n) => byTitle.set((n.title || "").trim().toLowerCase(), n));
  const linkSet = new Set<string>();
  const links: L[] = [];
  for (const n of notes) {
    const re = /\[\[([^\]|]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(n.body || ""))) {
      const target = byTitle.get(m[1].trim().toLowerCase());
      if (target && target.id !== n.id) {
        const key = [n.id, target.id].sort().join("|");
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ a: n.id, b: target.id });
        }
      }
    }
  }
  const deg = new Map<string, number>();
  links.forEach((l) => {
    deg.set(l.a, (deg.get(l.a) ?? 0) + 1);
    deg.set(l.b, (deg.get(l.b) ?? 0) + 1);
  });
  const nodes: N[] = notes.map((n, i) => {
    const angle = (i / Math.max(1, notes.length)) * Math.PI * 2;
    return {
      id: n.id,
      title: n.title || "(senza titolo)",
      deg: deg.get(n.id) ?? 0,
      x: 500 + Math.cos(angle) * 160,
      y: 340 + Math.sin(angle) * 160,
      vx: 0,
      vy: 0,
      fixed: false,
    };
  });
  return { nodes, links };
}

export function BrainGraph({ notes, onOpen }: { notes: Note[]; onOpen: (title: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const graph = useMemo(() => buildGraph(notes), [notes]);
  const nodesRef = useRef<N[]>(graph.nodes);
  const [, force] = useState(0);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const view = useRef({ x: 0, y: 0 });
  const W = 1000;
  const H = 680;

  useEffect(() => {
    nodesRef.current = graph.nodes;
  }, [graph]);

  useEffect(() => {
    let raf = 0;
    let ticks = 0;
    const step = () => {
      const nodes = nodesRef.current;
      const links = graph.links;
      const nById = new Map(nodes.map((n) => [n.id, n]));
      // repulsione
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) d2 = 1;
          const f = 5200 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          if (!a.fixed) {
            a.vx += fx;
            a.vy += fy;
          }
          if (!b.fixed) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }
      // molle sui link
      for (const l of links) {
        const a = nById.get(l.a);
        const b = nById.get(l.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 150) * 0.02;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        if (!a.fixed) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      // centro + damping
      for (const n of nodes) {
        if (n.fixed) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx += (W / 2 - n.x) * 0.004;
        n.vy += (H / 2 - n.y) * 0.004;
        n.vx *= 0.86;
        n.vy *= 0.86;
        n.x += n.vx;
        n.y += n.vy;
      }
      ticks++;
      force((v) => (v + 1) % 1000000);
      if (ticks < 600 || drag.current) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  function toSvg(clientX: number, clientY: number) {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W - view.current.x;
    const sy = ((clientY - r.top) / r.height) * H - view.current.y;
    return { x: sx, y: sy };
  }

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id, moved: false };
    const n = nodesRef.current.find((x) => x.id === id);
    if (n) n.fixed = true;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (drag.current) {
      const p = toSvg(e.clientX, e.clientY);
      const n = nodesRef.current.find((x) => x.id === drag.current!.id);
      if (n) {
        n.x = p.x;
        n.y = p.y;
        n.vx = 0;
        n.vy = 0;
      }
      drag.current.moved = true;
      force((v) => v + 1);
    } else if (pan.current) {
      const el = wrapRef.current!;
      const r = el.getBoundingClientRect();
      const dx = ((e.clientX - pan.current.x) / r.width) * W;
      const dy = ((e.clientY - pan.current.y) / r.height) * H;
      view.current = { x: pan.current.ox + dx, y: pan.current.oy + dy };
      force((v) => v + 1);
    }
  }
  function onPointerUpNode(e: React.PointerEvent, id: string, title: string) {
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    const n = nodesRef.current.find((x) => x.id === id);
    if (n) n.fixed = false;
    if (d && !d.moved) onOpen(title);
  }
  function onBgPointerDown(e: React.PointerEvent) {
    pan.current = { x: e.clientX, y: e.clientY, ox: view.current.x, oy: view.current.y };
  }
  function onBgPointerUp() {
    pan.current = null;
  }

  const nodes = nodesRef.current;
  const nById = new Map(nodes.map((n) => [n.id, n]));

  if (!notes.length) {
    return <div className="empty">Crea qualche nota nella Memoria e collega le note con [[Titolo]]: qui vedrai la mappa.</div>;
  }

  return (
    <div className="brain-wrap" ref={wrapRef}>
      <p className="hint" style={{ marginTop: 0 }}>
        Trascina i puntini per spostarli · clicca un puntino per aprire la nota · trascina lo sfondo per spostare la mappa
      </p>
      <svg
        className="brain-svg"
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onBgPointerUp}
        onPointerLeave={() => {
          drag.current = null;
          pan.current = null;
        }}
      >
        <g transform={`translate(${view.current.x} ${view.current.y})`}>
          {graph.links.map((l, i) => {
            const a = nById.get(l.a);
            const b = nById.get(l.b);
            if (!a || !b) return null;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="brain-link" />;
          })}
          {nodes.map((n) => {
            const r = 7 + Math.min(14, n.deg * 3);
            return (
              <g
                key={n.id}
                className="brain-node"
                onPointerDown={(e) => onPointerDownNode(e, n.id)}
                onPointerUp={(e) => onPointerUpNode(e, n.id, n.title)}
              >
                <circle cx={n.x} cy={n.y} r={r} />
                <text x={n.x} y={n.y + r + 14} textAnchor="middle">
                  {n.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
