import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, ExternalLink, Loader2 } from 'lucide-react';

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

const SYNAPSY_URL = 'https://synapse-learning-app-2026.vercel.app';

const WebKnowledgeGraph: React.FC<WebKnowledgeGraphProps> = ({ entries, onSelect }) => {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const categories = [...new Set(entries.map(e => e.category))];

  const filtered = activeFilter
    ? entries.filter(e => e.category === activeFilter)
    : entries;

  // Compute graph positions: ring layout
  const centerX = 50;
  const centerY = 50;
  const radius = 30;
  const nodesWithPos = filtered.map((entry, i) => {
    const angle = (i / filtered.length) * Math.PI * 2 - Math.PI / 2;
    return {
      ...entry,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  return (
    <div className="space-y-6">
      {/* Synapsy-style header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Globe className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Knowledge Graph</h3>
            <p className="text-[10px] text-amber-400/50 font-mono">{entries.length} concepts connected</p>
          </div>
        </div>
        <a
          href={SYNAPSY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-6 py-2 rounded-full transition-all text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-[11px] font-semibold uppercase tracking-wider"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Web Knowledge Graph
        </a>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveFilter(null)}
          className={`px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-all ${
            activeFilter === null
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/70'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-all ${
              activeFilter === cat
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/70'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Graph visualization */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Globe className="w-8 h-8 mx-auto mb-3 text-amber-500/30" />
          <div className="text-[11px] font-mono text-amber-500/40">No knowledge entries yet. Let the agent explore!</div>
        </div>
      ) : (
        <div className="relative">
          {/* Connection lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {nodesWithPos.map((a, i) =>
              nodesWithPos.slice(i + 1).map((b, j) => (
                <line
                  key={`${a.id}-${b.id}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={CATEGORY_COLORS[a.category] || '#f59e0b'}
                  strokeWidth="0.15"
                  opacity="0.15"
                />
              ))
            )}
          </svg>

          {/* Nodes */}
          <div className="relative grid grid-cols-2 md:grid-cols-3 gap-2">
            {nodesWithPos.slice(0, 30).map(entry => (
              <motion.button
                key={entry.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelect?.(entry)}
                className={`relative text-left p-3 rounded-xl border transition-all ${
                  hoveredId === entry.id
                    ? 'border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/5'
                    : 'border-white/10 bg-white/5 hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[entry.category] || '#f59e0b' }}
                  />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-amber-500/60">
                    {entry.category}
                  </span>
                </div>
                <div className="text-[10px] font-semibold text-white/80 leading-tight line-clamp-2">
                  {entry.title}
                </div>
                {hoveredId === entry.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center"
                  >
                    <span className="text-[7px] text-white font-bold">+</span>
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WebKnowledgeGraph;
