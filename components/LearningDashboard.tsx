import React from 'react';
import { Brain, Zap, BookOpen, Target, Activity } from 'lucide-react';
import { LearningMetrics as LearningMetricsType } from '../agent/types';

interface LearningDashboardProps {
  learningMetrics?: LearningMetricsType;
  isProcessing: boolean;
  currentTask: string;
  taskProgress: number;
}

const NeuralLinkIndicator: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10">
    <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50' : 'bg-gray-600'}`} />
    <span className="text-[10px] font-mono font-semibold uppercase tracking-widest">
      {active ? 'Neural Link Active' : 'Neural Link Idle'}
    </span>
  </div>
);

const MasteryBar: React.FC<{ label: string; score: number; color: string }> = ({ label, score, color }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[10px] font-mono">
      <span className="text-white/70">{label}</span>
      <span className="text-white/90 font-semibold">{score}%</span>
    </div>
    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{ width: `${score}%`, backgroundColor: color }}
      />
    </div>
  </div>
);

const CATEGORY_COLORS: Record<string, string> = {
  Architecture: '#38bdf8',
  Environment: '#4ade80',
  Infrastructure: '#f97316',
  Energy: '#fbbf24',
  Synthesis: '#a78bfa',
};

const LearningDashboard: React.FC<LearningDashboardProps> = ({
  learningMetrics,
  isProcessing,
  currentTask,
  taskProgress,
}) => {
  if (!learningMetrics) {
    return (
      <div className="px-4 py-3 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5">
        <div className="text-[11px] font-mono text-white/40">No learning data yet</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5 space-y-3">
      {/* Neural Link Status */}
      <div className="flex items-center justify-between">
        <NeuralLinkIndicator active={isProcessing} />
        <div className="flex items-center gap-1.5">
          <Brain className={`w-3.5 h-3.5 ${isProcessing ? 'text-emerald-400 animate-pulse' : 'text-white/30'}`} />
          <span className="text-[10px] font-mono text-white/50">{learningMetrics.totalConcepts} concepts</span>
        </div>
      </div>

      {/* Current Task */}
      <div className="space-y-1">
        <div className="text-[10px] font-mono text-white/60 truncate">{currentTask}</div>
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-sky-400 transition-all duration-700"
            style={{ width: `${taskProgress}%` }}
          />
        </div>
      </div>

      {/* Category Mastery Bars */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3 h-3 text-white/40" />
          <span className="text-[9px] font-mono font-semibold uppercase tracking-widest text-white/40">Knowledge Mastery</span>
        </div>
        {learningMetrics.categoryMastery.length === 0 ? (
          <div className="text-[10px] font-mono text-white/30 italic">Exploring...</div>
        ) : (
          learningMetrics.categoryMastery.map(cat => (
            <MasteryBar
              key={cat.category}
              label={cat.category}
              score={cat.masteryScore}
              color={CATEGORY_COLORS[cat.category] || '#38bdf8'}
            />
          ))
        )}
      </div>

      {/* Decision Quality & Diversity */}
      <div className="flex gap-3 pt-1">
        <div className="flex items-center gap-1.5">
          <Target className="w-3 h-3 text-white/40" />
          <span className="text-[10px] font-mono">
            <span className="text-white/90">{learningMetrics.decisionQualityScore}</span>
            <span className="text-white/30">/100</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-white/40" />
          <span className="text-[10px] font-mono">
            <span className="text-white/90">{learningMetrics.actionDiversity}%</span>
            <span className="text-white/30"> diversity</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-white/40" />
          <span className="text-[10px] font-mono">
            <span className="text-white/90">{learningMetrics.reinforcedCount}</span>
            <span className="text-white/30"> reinforced</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default LearningDashboard;
