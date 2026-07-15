import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, ExternalLink, ZoomIn, ZoomOut, RotateCcw, Activity } from 'lucide-react';

interface KnowledgeNode {
  id: string;
  title: string;
  description: string;
  category: string;
  iteration: number;
  timestamp: number;
}

interface WebKnowledgeGraphProps {
  entries: KnowledgeNode[];
  onSelect?: (entry: KnowledgeNode) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Architecture: '#f59e0b',
  Environment: '#10b981',
  Infrastructure: '#f97316',
  Energy: '#eab308',
  Synthesis: '#8b5cf6',
};
const CATEGORY_DEFAULT = '#f59e0b';
const SYNAPSY_URL = 'https://synapse-learning-app-2026.vercel.app';

// ─── Graph layout engine ────────────────────────────────────────────────

interface GraphNode {
  id: string; label: string; category: string; iteration: number;
  x: number; y: number; vx: number; vy: number;
  radius: number; color: string; connections: string[];
}

interface SynParticle {
  from: { x: number; y: number };
  to: { x: number; y: number };
  progress: number; speed: number; color: string; size: number;
}

function categoryBasePos(category: string, i: number): { x: number; y: number } {
  const order = ['Architecture', 'Environment', 'Infrastructure', 'Energy', 'Synthesis'];
  const idx = order.indexOf(category);
  const angle = idx >= 0 ? (idx / order.length) * Math.PI * 2 - Math.PI / 2 : Math.random() * Math.PI * 2;
  return { x: 400 + Math.cos(angle) * (140 + (i % 4) * 50), y: 280 + Math.sin(angle) * (140 + (i % 4) * 50) };
}

const WebKnowledgeGraph: React.FC<WebKnowledgeGraphProps> = ({ entries, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const particlesRef = useRef<SynParticle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, hovered: null as string | null });
  const [dims, setDims] = useState({ w: 700, h: 460 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [growthTick, setGrowthTick] = useState(0);

  // Build graph from entries
  const graph = useMemo(() => {
    if (entries.length === 0) return { nodes: [] as GraphNode[], particles: [] as SynParticle[] };
    const nodes: GraphNode[] = entries.slice(0, 60).map((e, i) => {
      const bp = categoryBasePos(e.category, i);
      return {
        id: e.id, label: e.title.length > 35 ? e.title.slice(0, 35) + '\u2026' : e.title,
        category: e.category, iteration: e.iteration,
        x: bp.x + (Math.random() - 0.5) * 30, y: bp.y + (Math.random() - 0.5) * 30,
        vx: 0, vy: 0,
        radius: 12 + Math.min(entries.filter(o => o.category === e.category).length * 1.5, 24),
        color: CATEGORY_COLORS[e.category] || CATEGORY_DEFAULT,
        connections: entries.filter(o => o.id !== e.id && o.category === e.category).slice(0, 4).map(o => o.id),
      };
    });
    const particles: SynParticle[] = [];
    for (let i = 0; i < Math.min(nodes.length * 2, 50); i++) {
      const a = nodes[i % nodes.length], b = nodes[(i + 1) % nodes.length];
      if (a && b) particles.push({ from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, progress: Math.random(), speed: 0.002 + Math.random() * 0.006, color: a.color, size: 1.5 + Math.random() * 2.5 });
    }
    return { nodes, particles };
  }, [entries, growthTick]);

  // Resize
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(es => { const r = es[0].contentRect; setDims({ w: Math.max(r.width, 400), h: Math.max(r.height, 350) }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const { w, h } = dims;
    canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const cx = w / 2, cy = h / 2;
    let nodes = nodesRef.current, particles = particlesRef.current;

    if (nodes.length !== graph.nodes.length) {
      nodes = graph.nodes.map(n => ({ ...n }));
      particles = graph.particles.map(p => ({ ...p, from: { ...p.from }, to: { ...p.to }, progress: Math.random() }));
      nodesRef.current = nodes; particlesRef.current = particles;
    }

    let relax = 0;
    const now = Date.now();

    function frame() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, w, h);

      // Relax toward equilibrium
      if (relax < 100) {
        for (const n of nodes) { n.vx += (cx - n.x) * 0.001; n.vy += (cy - n.y) * 0.001; n.x += n.vx * 0.12; n.y += n.vy * 0.12; n.vx *= 0.93; n.vy *= 0.93; }
        relax++;
      }

      const active = selectedId || mouseRef.current.hovered;

      // ── Draw connections ──
      for (const n of nodes) for (const cid of n.connections) {
        const t = nodes.find(x => x.id === cid); if (!t) continue;
        const on = active === n.id || active === cid;
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = n.color; ctx.globalAlpha = on ? 0.35 : 0.06; ctx.lineWidth = on ? 2 : 0.5;
        ctx.stroke();
        if (on) { ctx.shadowColor = n.color; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0; }
        ctx.globalAlpha = 1;
      }

      // ── Synaptic particles ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.progress += p.speed; if (p.progress > 1) p.progress = 0;
        const fi = i % nodes.length, ti = (i + 1) % nodes.length;
        const fn = nodes[fi], tn = nodes[ti];
        if (fn && tn) { p.from.x = fn.x; p.from.y = fn.y; p.to.x = tn.x; p.to.y = tn.y; }
        const x = p.from.x + (p.to.x - p.from.x) * p.progress;
        const y = p.from.y + (p.to.y - p.from.y) * p.progress;
        const isActive = active && (active === nodes[i % nodes.length]?.id);
        ctx.beginPath(); ctx.arc(x, y, isActive ? p.size * 1.6 : p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.globalAlpha = isActive ? 0.9 : 0.25 + Math.sin(p.progress * Math.PI) * 0.25;
        ctx.fill();
        ctx.shadowColor = p.color; ctx.shadowBlur = isActive ? 14 : 3; ctx.fill(); ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // ── Draw nodes ──
      for (const n of nodes) {
        const isHov = n.id === mouseRef.current.hovered;
        const isSel = n.id === selectedId;
        const isAct = n.id === active;
        const r = n.radius * (isHov ? 1.35 : 1) * (isSel ? 1.2 : 1);
        const pulse = isAct ? 1 + Math.sin(now * 0.004 + nodes.indexOf(n)) * 0.08 : 1;

        if (isAct) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.5 * pulse);
          g.addColorStop(0, n.color + '30'); g.addColorStop(1, 'transparent');
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.5 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
        }

        const grd = ctx.createRadialGradient(n.x - r * 0.3 * pulse, n.y - r * 0.3 * pulse, 0, n.x, n.y, r * pulse);
        grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.25, n.color); grd.addColorStop(1, n.color + '70');
        ctx.beginPath(); ctx.arc(n.x, n.y, r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        if (isAct) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }

        if (r > 14 || isHov) {
          ctx.fillStyle = isHov ? '#ffffff' : 'rgba(255,255,255,0.65)';
          ctx.font = isHov ? 'bold 9px monospace' : '8px monospace';
          ctx.textAlign = 'center'; ctx.fillText(n.label, n.x, n.y + r * pulse + 11);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '6px monospace';
        ctx.fillText(n.category, n.x, n.y - r * pulse - 5);
      }

      animRef.current = requestAnimationFrame(frame);
    }
    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, [dims, graph, selectedId]);

  // Mouse
  const onMove = useCallback((e: React.MouseEvent) => {
    const c = canvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, hovered: null };
    for (const n of nodesRef.current) {
      const dx = mouseRef.current.x - n.x, dy = mouseRef.current.y - n.y;
      if (dx * dx + dy * dy < (n.radius + 10) * (n.radius + 10)) { mouseRef.current.hovered = n.id; break; }
    }
    setHoveredId(mouseRef.current.hovered);
    c.style.cursor = mouseRef.current.hovered ? 'pointer' : 'default';
  }, []);

  const onClick = useCallback(() => {
    const id = mouseRef.current.hovered;
    if (id) { setSelectedId(p => p === id ? null : id); const e = entries.find(x => x.id === id); if (e) onSelect?.(e); }
    else setSelectedId(null);
  }, [entries, onSelect]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Neural Knowledge Web</h3>
            <p className="text-[9px] text-amber-400/40 font-mono">{entries.length} neurons &middot; {entries.length > 1 ? entries.length * 2 - 2 : 0} synapses</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all" title="Reset view"><RotateCcw className="w-3 h-3 text-white/50" /></button>
          <button onClick={() => setGrowthTick(t => t + 1)} className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all" title="Growth spike"><Activity className="w-3 h-3 text-emerald-400" /></button>
          <a href={SYNAPSY_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-[9px] font-semibold uppercase tracking-wider">
            <ExternalLink className="w-2.5 h-2.5" /> Web Graph
          </a>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative bg-black/60 rounded-2xl border border-amber-500/10 overflow-hidden" style={{ height: dims.h }}>
        <canvas ref={canvasRef} className="w-full h-full" onMouseMove={onMove} onClick={onClick} />

        <AnimatePresence>
          {hoveredId && (() => {
            const e = entries.find(x => x.id === hoveredId); if (!e) return null;
            return (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute bottom-3 left-3 right-3 p-2.5 rounded-xl bg-black/85 backdrop-blur-xl border border-amber-500/20">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[e.category] || CATEGORY_DEFAULT }} />
                  <span className="text-[7px] font-bold uppercase tracking-widest text-amber-500/60">{e.category}</span>
                  <span className="text-[6px] font-mono text-amber-500/30 ml-auto">#{e.iteration}</span>
                </div>
                <div className="text-[9px] font-semibold text-white/80">{e.title}</div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Activity className="w-8 h-8 mb-2 text-amber-500/20" />
            <div className="text-[10px] font-mono text-amber-500/30">Awaiting neural connections</div>
            <div className="text-[8px] font-mono text-amber-500/20 mt-0.5">Agent will build knowledge as it explores</div>
          </div>
        )}
      </div>

      {/* Legend + Growth bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_COLORS).map(([cat, col]) => (
            <div key={cat} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
              <span className="text-[7px] font-mono text-white/40">{cat}</span>
              <span className="text-[6px] font-mono text-white/20">({entries.filter(e => e.category === cat).length})</span>
            </div>
          ))}
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/5 border border-amber-500/10">
            <div className="flex gap-0.5 items-end h-3">
              {Array.from({ length: Math.min(Math.ceil(entries.length / 3), 12) }).map((_, i) => (
                <div key={i} className="w-0.5 rounded-full bg-amber-500/40"
                  style={{ height: 3 + Math.sin(i * 0.9 + growthTick + Date.now() * 0.001) * 4 + 3,
                    animation: `pulseH 1.8s ease-in-out ${i * 0.12}s infinite` }} />
              ))}
            </div>
            <span className="text-[7px] font-mono text-amber-500/40 ml-0.5">Growth: +{entries.length}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebKnowledgeGraph;
