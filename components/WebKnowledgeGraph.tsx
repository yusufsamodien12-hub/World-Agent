import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, ExternalLink, ZoomIn, Activity } from 'lucide-react';
import * as d3 from 'd3';

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

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  category: string;
  val: number;
  type: 'category' | 'concept';
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

const SYNAPSY_URL = 'https://synapse-learning-app-2026.vercel.app';

const WebKnowledgeGraph: React.FC<WebKnowledgeGraphProps> = ({ entries, onSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<KnowledgeNode | null>(null);

  // Build D3 graph data from entries
  const graph = React.useMemo(() => {
    if (entries.length === 0) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const cats = [...new Set(entries.map(e => e.category))];
    const categoryNodes: GraphNode[] = cats.map(c => ({ id: `cat-${c}`, name: c, category: c, val: entries.filter(e => e.category === c).length, type: 'category' }));
    const conceptNodes: GraphNode[] = entries.slice(0, 50).map(e => ({ id: e.id, name: e.title.length > 30 ? e.title.slice(0, 30) + '\u2026' : e.title, category: e.category, val: Math.min(e.iteration, 5) + 1, type: 'concept' }));
    const links: GraphLink[] = [];
    for (const n of conceptNodes) links.push({ source: n.id, target: `cat-${n.category}`, value: 1 });
    for (let i = 0; i < conceptNodes.length; i++) for (let j = i + 1; j < conceptNodes.length; j++) if (conceptNodes[i].category === conceptNodes[j].category) links.push({ source: conceptNodes[i].id, target: conceptNodes[j].id, value: 0.5 });
    return { nodes: [...categoryNodes, ...conceptNodes], links };
  }, [entries]);

  // Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(es => { const r = es[0].contentRect; setDims({ w: r.width, h: r.height }); });
    ro.observe(containerRef.current); return () => ro.disconnect();
  }, []);

  // D3 force simulation (same pattern as Synapsy's KnowledgeGraph)
  useEffect(() => {
    if (!svgRef.current || dims.w === 0 || graph.nodes.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const { w, h } = dims;

    const radius = (d: GraphNode) => d.type === 'category' ? 18 + d.val * 2 : 6 + d.val * 1.5;
    const color = (d: GraphNode) => {
      if (d.type === 'category') return '#f59e0b';
      const cols: Record<string, string> = { Architecture: '#f59e0b', Environment: '#10b981', Infrastructure: '#f97316', Energy: '#eab308', Synthesis: '#8b5cf6' };
      return cols[d.category] || '#94a3b8';
    };

    const sim = d3.forceSimulation<GraphNode>(graph.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graph.links).id(d => d.id).distance(60).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(d => radius(d) + 10));

    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);

    const link = g.append('g').selectAll('line').data(graph.links).enter().append('line')
      .attr('stroke', '#f59e0b').attr('stroke-opacity', 0.15).attr('stroke-width', d => Math.sqrt(d.value) * 0.8);

    const node = g.append('g').selectAll('circle').data(graph.nodes).enter().append('circle')
      .attr('r', d => radius(d))
      .attr('fill', d => color(d))
      .attr('stroke', d => d.type === 'category' ? '#fbbf24' : 'none')
      .attr('stroke-width', d => d.type === 'category' ? 2 : 0)
      .attr('cursor', 'pointer')
      .on('mouseenter', (e, d) => {
        const entry = entries.find(x => x.id === d.id); if (entry) setHovered(entry);
        d3.select(e.currentTarget).attr('stroke', '#fff').attr('stroke-width', 2);
      })
      .on('mouseleave', (e, d) => {
        setHovered(null);
        d3.select(e.currentTarget).attr('stroke', d.type === 'category' ? '#fbbf24' : 'none').attr('stroke-width', d.type === 'category' ? 2 : 0);
      })
      .on('click', (e, d) => { const entry = entries.find(x => x.id === d.id); if (entry) onSelect?.(entry); })
      .call(d3.drag<SVGCircleElement, GraphNode>()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any);

    node.filter(d => d.type === 'category').style('filter', 'drop-shadow(0 0 8px rgba(245,158,11,0.3))');

    g.append('g').selectAll('text').data(graph.nodes).enter().append('text')
      .text(d => d.name)
      .attr('font-size', d => `${d.type === 'category' ? 10 : 7}px`).attr('font-family', 'monospace')
      .attr('fill', d => d.type === 'category' ? '#fbbf24' : '#94a3b8')
      .attr('dx', d => radius(d) + 5).attr('dy', 3).attr('pointer-events', 'none')
      .style('text-shadow', '0 0 4px rgba(0,0,0,0.9)');

    sim.on('tick', () => {
      link.attr('x1', d => (d.source as GraphNode).x!).attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!).attr('y2', d => (d.target as GraphNode).y!);
      node.attr('cx', d => d.x!).attr('cy', d => d.y!);
      svg.selectAll('text').attr('x', d => (d as GraphNode).x!).attr('y', d => (d as GraphNode).y!);
    });

    return () => sim.stop();
  }, [graph, dims, entries, onSelect]);

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
            <p className="text-[9px] text-amber-400/40 font-mono">{graph.nodes.length} neurons &middot; {graph.links.length} synapses</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => svgRef.current && d3.select(svgRef.current).transition().duration(500).call(d3.zoomIdentity.scale(1) as any)} className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all" title="Reset">
            <ZoomIn className="w-3 h-3 text-white/50" />
          </button>
          <a href={SYNAPSY_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-[9px] font-semibold uppercase tracking-wider">
            <ExternalLink className="w-2.5 h-2.5" /> Web Graph
          </a>
        </div>
      </div>

      {/* D3 Canvas */}
      <div ref={containerRef} className="relative bg-black/60 rounded-2xl border border-amber-500/10 overflow-hidden" style={{ height: 460 }}>
        <svg ref={svgRef} className="w-full h-full" />

        {graph.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <Activity className="w-8 h-8 mb-2 text-amber-500/20" />
            <div className="text-[10px] font-mono text-amber-500/30">Awaiting neural connections</div>
            <div className="text-[8px] font-mono text-amber-500/20 mt-0.5">Agent will build knowledge as it explores</div>
          </div>
        )}

        <AnimatePresence>
          {hovered && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-3 left-3 right-3 p-2.5 rounded-xl bg-black/85 backdrop-blur-xl border border-amber-500/20 pointer-events-none">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                <span className="text-[7px] font-bold uppercase tracking-widest text-amber-500/60">{hovered.category}</span>
                <span className="text-[6px] font-mono text-amber-500/30 ml-auto">#{hovered.iteration}</span>
              </div>
              <div className="text-[9px] font-semibold text-white/80">{hovered.title}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Growth bar */}
      {entries.length > 0 && (
        <div className="flex justify-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/5 border border-amber-500/10">
            <div className="flex gap-0.5 items-end h-3">
              {Array.from({ length: Math.min(Math.ceil(entries.length / 3), 12) }).map((_, i) => (
                <div key={i} className="w-0.5 rounded-full bg-amber-500/40" style={{ height: 3 + Math.sin(i * 0.9) * 4 + 3 }} />
              ))}
            </div>
            <span className="text-[7px] font-mono text-amber-500/40 ml-0.5">Growth: +{entries.length}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebKnowledgeGraph;
