import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Activity, Network, History, Terminal as TerminalIcon, Target, Waves, TrendingUp, Download, X, ChevronRight, Search, Cpu, Zap, BookOpen, Loader2 } from 'lucide-react';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import WebKnowledgeGraph from '../components/WebKnowledgeGraph';
import { WorldObject, LogEntry, SimulationState, KnowledgeEntry, GroundingLink, ConstructionPlan, KnowledgeCategory, WorldObjectType } from './types';
import { decideNextAction, AIActionResponse } from '../services/aiLogic';
import { loadSimulationState, saveSimulationState } from '../services/memoryService';
import { logger } from '../services/logger';
import { generateId } from '../services/id';

const INITIAL_GOAL = "Synthesize Sustainable Modular Settlement";

const getTerrainHeight = (x: number, z: number) => {
  const height = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                 (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
  return roundToPrecision(height, 3);
};

const roundToPrecision = (value: number, decimals = 3): number => Number(value.toFixed(decimals));

const normalizePosition = (position: [number, number, number]): [number, number, number] => [
  roundToPrecision(position[0], 3),
  roundToPrecision(position[1], 3),
  roundToPrecision(position[2], 3)
];

const formatMetricLength = (meters: number): string => {
  if (!Number.isFinite(meters)) return '0.000 m';
  const abs = Math.abs(meters);
  if (abs < 1) {
    const millimeters = meters * 1000;
    return `${millimeters.toFixed(2)} mm (${meters.toFixed(4)} m)`;
  }
  if (abs < 1000) {
    const centimeters = meters * 100;
    return `${meters.toFixed(3)} m (${centimeters.toFixed(1)} cm)`;
  }
  const km = meters / 1000;
  const remainder = meters % 1000;
  return remainder === 0
    ? `${km.toFixed(3)} km`
    : `${km.toFixed(3)} km (${remainder.toFixed(3)} m)`;
};

const formatPositionWithUnits = (position: [number, number, number]): string => (
  `[${position.map(coord => formatMetricLength(coord)).join(', ')}]`
);

const VALID_PLAN_TYPES: WorldObjectType[] = [
  'wall', 'roof', 'door', 'crop', 'tree', 'well', 'fence', 'modular_unit', 'solar_panel', 'water_collector'
];

const normalizeConstructionPlan = (
  plan?: ConstructionPlan,
  fallbackObjective?: string
): ConstructionPlan | undefined => {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 5 || plan.steps.length > 12) {
    return undefined;
  }

  const normalizedSteps = plan.steps.map((step, index) => {
    const position = Array.isArray(step.position) && step.position.length >= 3
      ? [Number(step.position[0]), Number(step.position[1]), Number(step.position[2])] as [number, number, number]
      : [0, 0, 0] as [number, number, number];

    const status = step.status && ['pending', 'active', 'completed'].includes(step.status)
      ? step.status
      : (index === 0 ? 'active' : 'pending');

    const type = VALID_PLAN_TYPES.includes(step.type) ? step.type : 'modular_unit';
    const label = typeof step.label === 'string' && step.label.trim().length > 0 ? step.label : `${type} step ${index + 1}`;

    return {
      ...step,
      type,
      label,
      position,
      status
    };
  });

  if (normalizedSteps.some(step => step.position.some(coord => !Number.isFinite(coord)))) {
    return undefined;
  }

  const positions = new Set(normalizedSteps.map(step => step.position.join(',')));
  if (positions.size !== normalizedSteps.length) {
    return undefined;
  }

  const activeCount = normalizedSteps.filter(step => step.status === 'active').length;
  if (activeCount !== 1) {
    const firstActiveIndex = normalizedSteps.findIndex(step => step.status === 'active');
    const correctedSteps = normalizedSteps.map((step, index) => {
      if (firstActiveIndex >= 0) {
        if (index < firstActiveIndex) return { ...step, status: 'completed' as const };
        if (index === firstActiveIndex) return { ...step, status: 'active' as const };
        return { ...step, status: 'pending' as const };
      }
      if (index === 0) return { ...step, status: 'active' as const };
      return { ...step, status: 'pending' as const };
    });
    return {
      ...plan,
      objective: plan.objective || fallbackObjective || 'Architectural Synthesis',
      currentStepIndex: firstActiveIndex >= 0 ? firstActiveIndex : 0,
      planId: plan.planId || generateId(),
      steps: correctedSteps
    };
  }

  const activeIndex = normalizedSteps.findIndex(step => step.status === 'active');
  const resolvedSteps = normalizedSteps.map((step, index) => {
    if (index < activeIndex) return { ...step, status: 'completed' as const };
    if (index === activeIndex) return { ...step, status: 'active' as const };
    return { ...step, status: 'pending' as const };
  });

  return {
    ...plan,
    objective: plan.objective || fallbackObjective || 'Architectural Synthesis',
    currentStepIndex: activeIndex,
    planId: plan.planId || generateId(),
    steps: resolvedSteps
  };
};

const getFallbackMesh = (type: WorldObjectType) => {
  switch (type) {
    case 'wall':
      return {
        materialResearch: 'Reinforced composite wall with visible support ribs.',
        parts: [
          { geometry: 'box' as const, args: [1.2, 2.1, 0.2], position: [0, 1.05, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#8f9ca8', roughness: 0.8, metalness: 0.1 } },
          { geometry: 'box' as const, args: [0.1, 2.1, 0.2], position: [-0.55, 1.05, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#4b5563', roughness: 0.7, metalness: 0.2 } },
          { geometry: 'box' as const, args: [0.1, 2.1, 0.2], position: [0.55, 1.05, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#4b5563', roughness: 0.7, metalness: 0.2 } },
        ]
      };
    case 'roof':
      return {
        materialResearch: 'Sloped modular roof panels with a reinforced ridge.',
        parts: [
          { geometry: 'box' as const, args: [1.4, 0.18, 1.4], position: [0, 0.1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#7c2d12', roughness: 0.88, metalness: 0.05 } },
          { geometry: 'box' as const, args: [1.4, 0.18, 0.3], position: [0, 0.25, 0.55] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#9d3411', roughness: 0.88, metalness: 0.05 } },
        ]
      };
    case 'door':
      return {
        materialResearch: 'Simple wooden door with a brass handle accent.',
        parts: [
          { geometry: 'box' as const, args: [0.7, 1.9, 0.14], position: [0, 0.95, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#764f28', roughness: 0.7, metalness: 0.03 } },
          { geometry: 'cylinder' as const, args: [0.05, 0.05, 0.2, 12], position: [0.28, 0.95, 0.08] as [number, number, number], rotation: [0, 0, Math.PI / 2] as [number, number, number], material: { color: '#d5a021', roughness: 0.3, metalness: 0.85 } },
        ]
      };
    case 'modular_unit':
      return {
        materialResearch: 'Modular housing block with panelized siding and reinforced edges.',
        parts: [
          { geometry: 'box' as const, args: [1.4, 1.2, 1.2], position: [0, 0.6, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#1f2937', roughness: 0.5, metalness: 0.25 } },
          { geometry: 'box' as const, args: [1.4, 0.1, 0.05], position: [0, 0.55, 0.6] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#334155', roughness: 0.8, metalness: 0.2 } },
          { geometry: 'box' as const, args: [1.4, 0.1, 0.05], position: [0, 0.55, -0.6] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#334155', roughness: 0.8, metalness: 0.2 } },
        ]
      };
    default:
      return undefined;
  }
};

const buildFallbackHousePlan = (anchor: [number, number, number], objective: string): ConstructionPlan => {
  const [x, y, z] = anchor;
  const wallOffset = 1.25;
  const doorOffset = 1.0;
  return {
    planId: generateId(),
    objective,
    currentStepIndex: 0,
    steps: [
      { label: 'Foundation', type: 'modular_unit', position: [x, y, z], status: 'active', customMesh: getFallbackMesh('modular_unit') },
      { label: 'Wall East', type: 'wall', position: [x + wallOffset, y, z], status: 'pending', customMesh: getFallbackMesh('wall') },
      { label: 'Wall West', type: 'wall', position: [x - wallOffset, y, z], status: 'pending', customMesh: getFallbackMesh('wall') },
      { label: 'Roof', type: 'roof', position: [x, y + 2, z], status: 'pending', customMesh: getFallbackMesh('roof') },
      { label: 'Door', type: 'door', position: [x, y, z - doorOffset], status: 'pending', customMesh: getFallbackMesh('door') }
    ]
  };
};

type ViewType = 'nexus' | 'knowledge' | 'logs' | 'planning';

function App() {
  logger.info('App', '🚀 App component initializing');
  logger.info('App', 'Environment', { 
    isDev: import.meta.env.DEV, 
    mode: import.meta.env.MODE,
    proxyUrl: import.meta.env.VITE_PROXY_URL,
    hasApiKey: !!import.meta.env.VITE_MISTRAL_API_KEY
  });
  
  const [view, setView] = useState<ViewType>('nexus');
  const [state, setState] = useState<SimulationState>({
    objects: [],
    logs: [{ id: '1', type: 'success', message: 'System ready.', timestamp: Date.now() }],
    knowledgeBase: [],
    currentGoal: INITIAL_GOAL,
    learningIteration: 0,
    networkStatus: 'connected',
    activePlan: undefined,
    progression: {
      complexityLevel: 1,
      structuresCompleted: 0,
      totalBlocks: 0,
      unlockedBlueprints: ['Basic', 'Advanced']
    },
    apiMetrics: [],
    ui: { showStats: true, showKnowledge: true, showLogs: true, showPlanning: true, showNetwork: true }
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastStepTime = useRef(0);

  const [isAuto, setIsAuto] = useState(true);
  const [currentTask, setCurrentTask] = useState<string>("Analyzing area...");
  const [taskProgress, setTaskProgress] = useState(0);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeEntry | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'action') => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, { id: generateId(), type, message, timestamp: Date.now() }]
    }));
  }, []);

  // Load state on mount (run once)
  useEffect(() => {
    logger.info('App', '🔄 Initializing memory system');
    async function initMemory() {
      try {
        const savedState = await loadSimulationState();
        if (savedState) {
          logger.info('App', '✅ Loaded saved state', { 
            objects: savedState.objects?.length,
            logs: savedState.logs?.length,
            knowledge: savedState.knowledgeBase?.length
          });
          setState(prev => ({
            ...prev,
            ...savedState,
            logs: savedState.logs || prev.logs
          }));
        }
      } catch (err) {
        console.error("Memory initialization failed:", err);
      }
    }
    initMemory();
  }, []); // Run once on mount only

  // Auto-save state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (state.objects.length > 0 || state.knowledgeBase.length > 0) {
        saveSimulationState(state);
      }
    }, 5000); 
    return () => clearTimeout(timer);
  }, [state.objects, state.knowledgeBase, state.progression, state.activePlan]);

  const runSimulationStep = useCallback(async () => {
    // Rate-limit guard: prevent re-execution within 6s
    const now = Date.now();
    if (isProcessingRef.current || now - lastStepTime.current < 6000) return;
    lastStepTime.current = now;
    isProcessingRef.current = true;

    setIsProcessing(true);
    const currentState = stateRef.current;
    setState(prev => ({ ...prev, networkStatus: 'syncing' }));
    setTaskProgress(5);

    addLog("Connecting to AI...", "thinking");
    await new Promise(r => setTimeout(r, 400));
    addLog("Reading environment data...", "thinking");
    await new Promise(r => setTimeout(r, 600));
    setTaskProgress(20);
    const apiStartTime = Date.now();

    try {
      const decision: AIActionResponse = await decideNextAction(
        currentState.logs, 
        currentState.objects, 
        currentState.currentGoal, 
        currentState.knowledgeBase,
        getTerrainHeight,
        currentState.activePlan
      );
      
      const apiLatency = Date.now() - apiStartTime;
      setState(prev => ({
        ...prev,
        apiMetrics: [...prev.apiMetrics, { id: generateId(), timestamp: Date.now(), latency: apiLatency, status: 'success' as const }].slice(-20)
      }));

      setTaskProgress(40);
      addLog("AI response received.", "success");
      
      if (decision.reasoningSteps && decision.reasoningSteps.length > 0) {
        for (const step of decision.reasoningSteps) {
          addLog(`[REASONING]: ${step}`, 'thinking');
          await new Promise(r => setTimeout(r, 600));
        }
      }

      setCurrentTask(decision.taskLabel);
      if (decision.outcomeSummary) {
        addLog(`Outcome summary: ${decision.outcomeSummary}`, 'thinking');
      }
      if (decision.decisionFactors && decision.decisionFactors.length > 0) {
        addLog(`Decision factors: ${decision.decisionFactors.join(', ')}`, 'thinking');
      }
      if (decision.connectivityConfirmation) {
        addLog(`Connectivity: ${decision.connectivityConfirmation}`, 'thinking');
      }
      setTaskProgress(70);

      if (decision.action === 'PLACE') {
        const normalizedIncomingPlan = normalizeConstructionPlan(
          decision.plan,
          decision.taskLabel || 'Architectural Synthesis'
        );
        const normalizedActivePlan = normalizeConstructionPlan(state.activePlan);
        let nextPlan = normalizedIncomingPlan || normalizedActivePlan;

        if (decision.plan && !normalizedIncomingPlan) {
          logger.warn('App', 'Discarded invalid incoming plan from AI; using fallback or active plan instead.', { plan: decision.plan });
          addLog('Invalid AI plan detected; using fallback or continuing existing plan.', 'error');
        }

        if (!nextPlan) {
          const anchor = state.objects[state.objects.length - 1]?.position || [0, 0, 0];
          nextPlan = buildFallbackHousePlan(anchor as [number, number, number], decision.reason || 'Shelter');
          addLog('No valid plan available; assembling a fallback house blueprint.', 'thinking');
        }

        const currentStep = nextPlan?.steps?.[nextPlan.currentStepIndex];
        if (nextPlan && !currentStep) {
          logger.warn('App', 'Received plan with invalid currentStepIndex, discarding plan', { plan: nextPlan });
          nextPlan = undefined;
        }
        const resolvedObjectType = (decision.objectType as string) === 'floor' ? 'modular_unit' : decision.objectType;
        const targetType = resolvedObjectType || currentStep?.type || 'modular_unit';
        let targetPos = decision.position || currentStep?.position || [0, 0, 0];

        if (!Array.isArray(targetPos) || targetPos.length !== 3) {
          targetPos = currentStep?.position || [0, 0, 0];
        }

        const x = Number(targetPos[0]);
        const yCandidate = Number(targetPos[1]);
        const z = Number(targetPos[2]);
        const y = Number.isFinite(yCandidate) ? yCandidate : getTerrainHeight(x, z);
        targetPos = normalizePosition([x, y, z]);

        addLog(`Placing ${targetType} unit at ${formatPositionWithUnits(targetPos)}.`, 'success');
        const meshResearch = decision.customMesh?.materialResearch || currentStep?.customMesh?.materialResearch;
        if (meshResearch) {
          addLog(`Material research: ${meshResearch}`, 'thinking');
        }
        
        await new Promise(r => setTimeout(r, 800));
        setTaskProgress(100);

        const newObj: WorldObject = {
          id: generateId(),
          type: targetType as any,
          position: targetPos as [number, number, number],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          timestamp: Date.now(),
          customMesh: decision.customMesh || currentStep?.customMesh
        };

        setState(prev => {
          let updatedPlan = normalizeConstructionPlan(nextPlan, decision.taskLabel || 'Architectural Synthesis');
          if (updatedPlan && updatedPlan.steps && updatedPlan.steps[updatedPlan.currentStepIndex]) {
            const steps = [...updatedPlan.steps];
            steps[updatedPlan.currentStepIndex] = {
              ...steps[updatedPlan.currentStepIndex],
              status: 'completed'
            };

            const nextIdx = updatedPlan.currentStepIndex + 1;

            if (nextIdx < steps.length) {
              steps[nextIdx] = {
                ...steps[nextIdx],
                status: 'active'
              };
              updatedPlan = { ...updatedPlan, steps, currentStepIndex: nextIdx };
            } else {
              updatedPlan = undefined;
              addLog("Strategic Objective Achieved.", "success");
            }
          } else {
            logger.warn('App', 'Plan became invalid during update; discarding plan.', { updatedPlan });
            updatedPlan = undefined;
          }

          const newKnowledge = [...prev.knowledgeBase];
          const titleCandidate = decision.learningNote?.split(':')[0]?.trim() || "Synthesis Logic";
          
          if (!newKnowledge.find(k => k.title === titleCandidate)) {
            newKnowledge.push({
              id: generateId(),
              title: titleCandidate,
              description: decision.learningNote,
              category: decision.knowledgeCategory,
              iteration: prev.learningIteration,
              timestamp: Date.now(),
              links: decision.groundingLinks
            });
          }

          return {
            ...prev,
            objects: [...prev.objects, newObj],
            learningIteration: prev.learningIteration + 1,
            activePlan: updatedPlan,
            knowledgeBase: newKnowledge,
            progression: {
              ...prev.progression,
              totalBlocks: prev.progression.totalBlocks + 1,
              complexityLevel: Math.floor((prev.progression.totalBlocks + 1) / 5) + 1,
              structuresCompleted: prev.progression.structuresCompleted + (targetType === 'modular_unit' ? 1 : 0)
            }
          };
        });
      } else if (decision.action === 'MOVE' && decision.position) {
        addLog(`Moving to new position.`, 'action');
      } else {
        addLog(`Simulation standby: ${decision.reason}`, 'action');
      }
    } catch (e) {
      addLog("Connection error.", "error");
      setState(prev => ({ 
        ...prev, 
        networkStatus: 'error',
        apiMetrics: [...prev.apiMetrics, { id: generateId(), timestamp: Date.now(), latency: Date.now() - apiStartTime, status: 'error' as const }].slice(-20) 
      }));
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setTaskProgress(0);
      setState(prev => ({ 
        ...prev, 
        networkStatus: prev.networkStatus === 'error' ? 'error' : 'connected' 
      }));
      setCurrentTask(isAuto ? "Scanning..." : "Standby");
    }
  }, [isAuto, addLog]); // Note: intentionally excludes `state` — use stateRef.current inside

  // Stable auto-pilot timer: uses refs to avoid recreating the interval on every render
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    function tick() {
      if (!isAuto) return;
      runSimulationStep();
      autoTimerRef.current = setTimeout(tick, 8000);
    }
    if (isAuto) {
      autoTimerRef.current = setTimeout(tick, 8000);
    }
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [isAuto]); // Only depends on isAuto — stable timer

  useEffect(() => {
    if (logContainerRef.current) logContainerRef.current.scrollTo({ top: logContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.logs]);

  const downloadState = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-state-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog('State exported.', 'success');
  };

  return (
    <div className="relative w-full h-screen overflow-hidden font-sans bg-slate-900 text-slate-100">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#111827_0%,#020617_75%)] opacity-85" />

      {/* Neural Dashboard Header */}
      <div className="absolute top-0 left-0 w-full px-10 h-24 border-b border-white/10 flex justify-between items-center z-20 pointer-events-none bg-slate-900/95 backdrop-blur-3xl shadow-[0_35px_120px_rgba(15,23,42,0.35)]">
        <div className="pointer-events-auto flex items-center gap-12">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-1000 ${isProcessing ? 'border-sky-400 bg-sky-400/20 scale-110 shadow-[0_0_20px_rgba(56,189,248,0.5)]' : 'border-white/10 bg-white/5'}`}>
                <Brain className={`w-5 h-5 ${isProcessing ? 'text-sky-400' : 'text-slate-500'}`} />
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-950 ${isProcessing ? 'bg-sky-400' : 'bg-emerald-400'}`} />
            </div>
            <div>
              <h1 className="text-xl font-black italic tracking-tight text-white/90">
                A <span className="text-sky-400">Brain</span>
              </h1>
              <div className="flex items-center gap-2">
                <div className={`w-1 h-1 rounded-full animate-pulse ${isProcessing ? 'bg-sky-400' : 'bg-emerald-400'}`} />
                <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-500">
                  {isProcessing ? 'Synthesizing...' : 'Neural Link Active'}
                </p>
              </div>
            </div>
          </div>

          {/* Metrics Panel */}
          <div className="hidden lg:flex gap-10 border-l border-white/10 pl-10">
            <div className="space-y-1">
              <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Structures</p>
              <div className="flex items-center gap-2">
                <Waves className="w-3 h-3 text-emerald-400/70" />
                <span className="text-xs font-mono">{state.progression.structuresCompleted}</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Knowledge</p>
              <span className="text-xs font-mono text-sky-400">{state.knowledgeBase.length}</span>
            </div>
            <div className="space-y-1">
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Complexity</p>
              <span className="text-xs font-mono text-emerald-400">Tier {state.progression.complexityLevel}</span>
            </div>
            <div className="space-y-1">
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Blocks</p>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-sky-400" />
                <span className="text-xs font-mono">{state.progression.totalBlocks}</span>
              </div>
            </div>
            <div className="space-y-1 max-w-[150px]">
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Iteration</p>
              <span className="text-[10px] font-mono text-white truncate block">#{state.learningIteration}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 pointer-events-auto">
          <div className="flex gap-4 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300 bg-slate-950/40 p-1.5 rounded-full border border-white/10">
            <button 
              onClick={() => setView('nexus')}
              className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${view === 'nexus' ? 'text-sky-400 bg-sky-400/15' : 'hover:text-white'}`}
            >
              <Target className="w-3 h-3" /> Core
            </button>
            <button 
              onClick={() => setView('knowledge')}
              className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${view === 'knowledge' ? 'text-amber-500 bg-amber-500/10' : 'hover:text-white'}`}
            >
              <Network className="w-3 h-3" /> Knowledge
            </button>
            <button 
              onClick={() => setView('logs')}
              className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${view === 'logs' ? 'text-sky-400 bg-sky-400/10' : 'hover:text-white'}`}
            >
              <History className="w-3 h-3" /> Log
            </button>
            <button 
              onClick={() => setView('planning')}
              className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${view === 'planning' ? 'text-sky-400 bg-sky-400/10' : 'hover:text-white'}`}
            >
              <BookOpen className="w-3 h-3" /> Plan
            </button>
            <button 
              onClick={downloadState}
              className="flex items-center gap-2 px-6 py-2 rounded-full hover:text-white transition-all text-slate-500"
              title="Download Neural State"
            >
              <Download className="w-3 h-3" /> Export
            </button>
          </div>

          {/* Network Status */}
          <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
            <div className={`w-2 h-2 rounded-full ${
              state.networkStatus === 'syncing' ? 'bg-sky-400 animate-ping' : 
              state.networkStatus === 'error' ? 'bg-red-500 shadow-[0_0_15px_#ef4444]' :
              'bg-emerald-400 shadow-[0_0_15px_#10b981]'
            }`} />
            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${
              state.networkStatus === 'syncing' ? 'text-sky-400' : 
              state.networkStatus === 'error' ? 'text-red-500' :
              'text-emerald-400'
            }`}>
              {state.networkStatus === 'syncing' ? 'SYNCING...' : 
               state.networkStatus === 'error' ? 'LINK ERROR' :
               'ACTIVE'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="absolute inset-0 z-10 pt-24">
        {view === 'nexus' && (
          <div className="w-full h-full overflow-y-auto pt-14 pb-24 px-10">
            <div className="max-w-4xl mx-auto">
              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="p-6 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl">
                  <div className="text-[7px] font-black text-white/30 uppercase mb-1">Structures</div>
                  <div className="text-3xl font-mono font-bold text-white">{state.progression.structuresCompleted}</div>
                  <div className="text-[8px] text-slate-300 mt-1">Total built</div>
                </div>
                <div className="p-6 bg-slate-900/65 backdrop-blur-2xl border border-white/15 rounded-[30px] shadow-[0_35px_80px_rgba(15,23,42,0.28)]">
                  <div className="text-[7px] font-black text-white/30 uppercase mb-1">Knowledge</div>
                  <div className="text-3xl font-mono font-bold text-sky-400">{state.knowledgeBase.length}</div>
                  <div className="text-[8px] text-slate-500 mt-1">Neural nodes</div>
                </div>
                <div className="p-6 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl">
                  <div className="text-[7px] font-black text-white/20 uppercase mb-1">Complexity</div>
                  <div className="text-3xl font-mono font-bold text-emerald-400">Tier {state.progression.complexityLevel}</div>
                  <div className="text-[8px] text-slate-500 mt-1">Growth level</div>
                </div>
                <div className="p-6 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl">
                  <div className="text-[7px] font-black text-white/20 uppercase mb-1">Blocks</div>
                  <div className="text-3xl font-mono font-bold text-white">{state.progression.totalBlocks}</div>
                  <div className="text-[8px] text-slate-500 mt-1">Modules deployed</div>
                </div>
              </div>

              {/* Core Goal & Actions */}
              <div className="p-8 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl mb-8">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="text-[9px] font-black uppercase text-sky-400 tracking-[0.3em]">Current Directive</div>
                    <p className="text-2xl font-black italic text-white leading-tight">{currentTask}</p>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between pt-8 border-t border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3 bg-white/10 px-5 py-3 rounded-full">
                        <div className={`w-2 h-2 rounded-full ${isAuto ? 'bg-sky-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">{isAuto ? 'Auto-Pilot' : 'Manual'}</span>
                      </div>
                      <button 
                        onClick={() => setIsAuto(!isAuto)}
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAuto ? 'bg-sky-500 text-white shadow-xl shadow-sky-500/20' : 'bg-white/5 text-white/50 hover:text-white'}`}
                      >
                        {isAuto ? 'Pause Loop' : 'Resume Loop'}
                      </button>
                      <button 
                        onClick={runSimulationStep} 
                        disabled={isProcessing}
                        className="px-10 py-3 bg-white hover:bg-sky-50 text-slate-950 rounded-xl font-black uppercase italic tracking-tighter transition-all shadow-2xl disabled:opacity-50 active:scale-95 text-[11px]"
                      >
                        {isProcessing ? 'Processing...' : 'Initiate Synthesis'}
                      </button>
                    </div>
                    {isProcessing && (
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-400 transition-all duration-700" style={{ width: `${taskProgress}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-sky-400">{taskProgress}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* API Metrics Graph */}
              <div className="h-32 bg-slate-900/65 backdrop-blur-2xl border border-white/15 rounded-[30px] shadow-[0_35px_80px_rgba(15,23,42,0.28)] overflow-hidden mb-8">
                <div className="px-5 py-3 border-b border-white/10 flex justify-between items-center bg-white/10">
                  <span className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.3em]">Neural Uplink Metrics</span>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  </div>
                </div>
                <div className="flex-1 relative flex items-end justify-between px-5 pb-2 pt-4 gap-0.5 h-[calc(100%-36px)]">
                  {state.apiMetrics.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-widest text-white/20">Awaiting data stream...</div>}
                  {state.apiMetrics.map((m) => {
                    const heightPct = Math.min(100, (m.latency / 2000) * 100); 
                    return (
                      <div key={m.id} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                        <div 
                          style={{ height: `${Math.max(5, heightPct)}%` }} 
                          className={`w-full rounded-t-[2px] transition-all duration-500 ${m.status === 'success' ? 'bg-gradient-to-t from-emerald-500/60 to-emerald-400/90 group-hover:from-emerald-400/80 group-hover:to-emerald-300' : 'bg-gradient-to-t from-red-500/60 to-red-400/90 group-hover:from-red-400/80 group-hover:to-red-300'}`}
                        />
                      </div>
                    );
                  })}
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/5 border-t border-dashed border-white/10 pointer-events-none" />
                </div>
              </div>

              {/* Architecture Blueprint Preview */}
              <div className="p-8 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="text-[9px] font-black uppercase text-sky-400 tracking-[0.3em]">Architectural Intelligence</div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Goal: {state.currentGoal}</div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="text-[8px] font-black text-white/20 uppercase mb-2">Strategy</div>
                    <div className="text-sm font-bold text-white/90">Modular Synthesis</div>
                    <div className="text-[9px] text-slate-500 mt-1">Grid-aligned expansion</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="text-[8px] font-black text-white/20 uppercase mb-2">Pattern</div>
                    <div className="text-sm font-bold text-white/90">Rectilinear clusters</div>
                    <div className="text-[9px] text-slate-500 mt-1">Coherent districts</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="text-[8px] font-black text-white/20 uppercase mb-2">Density</div>
                    <div className="text-sm font-bold text-white/90">{(state.progression.totalBlocks / Math.max(1, state.progression.structuresCompleted)).toFixed(1)} avg/structure</div>
                    <div className="text-[9px] text-slate-500 mt-1">Modules per building</div>
                  </div>
                </div>
              </div>

              {/* Active Plan */}
              {state.activePlan && (
                <div className="p-6 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl">
                  <div className="flex flex-col gap-1 mb-6">
                    <span className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.4em]">Active Construction Plan</span>
                    <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">{state.activePlan.objective || "Strategic Synthesis"}</h2>
                  </div>
                  <div className="space-y-2">
                    {state.activePlan.steps.map((step, idx) => (
                      <div key={idx} className={`relative flex flex-col gap-2 p-4 rounded-xl border transition-all duration-500 ${step.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : step.status === 'completed' ? 'bg-white/5 border-white/10 opacity-40' : 'bg-transparent border-white/5 opacity-20'}`}>
                        <div className="flex items-center gap-3 justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${step.status === 'active' ? 'bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : step.status === 'completed' ? 'bg-white' : 'bg-white/20'}`} />
                            <span className="text-[11px] font-bold tracking-tight uppercase text-white/90">{step.label}</span>
                          </div>
                          <span className="text-[8px] font-mono text-white/30 uppercase">[{step.type.toUpperCase()}]</span>
                        </div>
                        <div className="text-[9px] font-mono text-slate-400/80 ml-5">{formatPositionWithUnits(step.position)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'knowledge' && (
          <div className="w-full h-full overflow-y-auto pt-14 pb-24 px-10">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Synapsy-style Web Knowledge Graph */}
              <div className="bg-black/40 backdrop-blur-xl border border-amber-500/10 rounded-[30px] p-6">
                <WebKnowledgeGraph entries={state.knowledgeBase} onSelect={setSelectedKnowledge} />
              </div>

              {/* Knowledge list */}
              <div className="grid gap-3">
                {state.knowledgeBase.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-[10px] font-mono text-amber-500/40">No knowledge yet. Let the agent explore!</div>
                  </div>
                ) : (
                  state.knowledgeBase.slice().reverse().map((k) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={k.id} 
                      className="p-4 bg-black/40 backdrop-blur-xl border border-amber-500/10 rounded-2xl hover:border-amber-500/30 transition-all cursor-pointer"
                      onClick={() => setSelectedKnowledge(k)}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">{k.category}</span>
                        <span className="text-[7px] font-mono text-amber-500/30">#{k.iteration}</span>
                      </div>
                      <h4 className="text-sm font-black text-white mb-2 uppercase italic">{k.title}</h4>
                      <p className="text-[11px] leading-relaxed text-white/50">{k.description}</p>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'logs' && (
          <div className="w-full h-full overflow-y-auto pt-14 pb-24 px-10">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="flex justify-between items-end">
                <h2 className="text-4xl font-black italic text-white underline decoration-sky-400/30 underline-offset-8">Activity Log</h2>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Entries: {state.logs.length}</div>
              </div>
              <div ref={logContainerRef} className="space-y-2 max-h-[60vh] overflow-y-auto">
                {state.logs.map(log => (
                  <div key={log.id} className={`flex gap-3 p-3 rounded-xl transition-all duration-300 ${log.type === 'success' ? 'bg-emerald-500/10 text-emerald-300' : log.type === 'error' ? 'bg-rose-500/10 text-rose-300' : log.type === 'thinking' ? 'bg-sky-500/5 text-sky-400/80 italic border-l-2 pl-3 border-sky-400/30' : 'bg-white/5 text-white/50'}`}>
                    <span className="opacity-30 shrink-0 text-[9px]">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                    <span className="font-bold text-[10px]">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'planning' && (
          <div className="w-full h-full overflow-y-auto pt-14 pb-24 px-10">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="flex justify-between items-end">
                <h2 className="text-4xl font-black italic text-white underline decoration-sky-400/30 underline-offset-8">Construction Plans</h2>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Goal: {state.currentGoal}</div>
              </div>
              
              {state.activePlan ? (
                <div className="space-y-4">
                  <div className="p-6 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px]">
                    <div className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.4em] mb-2">Active Plan</div>
                    <h3 className="text-xl font-black italic text-white">{state.activePlan.objective}</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Plan ID: {state.activePlan.planId}</p>
                  </div>
                  <div className="grid gap-3">
                    {state.activePlan.steps.map((step, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={idx}
                        className={`p-6 bg-slate-950/40 backdrop-blur-xl border rounded-[30px] flex justify-between items-center group transition-all ${step.status === 'active' ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : step.status === 'completed' ? 'border-white/10 opacity-50' : 'border-white/5'}`}
                      >
                        <div className="flex items-center gap-6">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-xs border ${step.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : step.status === 'completed' ? 'bg-white/5 text-white/30 border-white/10' : 'bg-white/5 text-white/30 border-white/10'}`}>
                            {idx + 1}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white">{step.label}</h4>
                            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{step.type} — {step.status}</p>
                            <p className="text-[8px] font-mono text-slate-600 mt-1">{formatPositionWithUnits(step.position)}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-sky-400 transition-all" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center">
                  <div className="text-4xl mb-4">🧠</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">No active plan. Awaiting AI directive...</div>
                </div>
              )}

              {/* Blueprints */}
              <div className="p-6 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px]">
                <div className="text-[9px] font-black uppercase text-sky-400 tracking-[0.4em] mb-3">Unlocked Blueprints</div>
                <div className="flex flex-wrap gap-2">
                  {state.progression.unlockedBlueprints.map((bp, i) => (
                    <span key={i} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[9px] font-mono text-slate-300">{bp}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Knowledge Detail Panel */}
      <AnimatePresence>
        {selectedKnowledge && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 180 }}
            className="absolute right-0 top-0 h-full w-[max(35vw,520px)] bg-slate-950/95 backdrop-blur-2xl border-l border-white/5 z-30 p-12 pt-36 shadow-[-60px_0_100px_rgba(0,0,0,0.9)] overflow-y-auto"
          >
            <button 
              onClick={() => setSelectedKnowledge(null)}
              className="absolute top-12 right-12 w-10 h-10 rounded-full border border-white/5 flex items-center justify-center hover:bg-white/5 transition-all text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                  <span className="text-[11px] font-bold text-sky-200/40 uppercase tracking-[0.3em]">
                    Neural Knowledge Node
                  </span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                <h2 className="text-4xl font-black italic text-white leading-none tracking-tighter">{selectedKnowledge.title}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest">{selectedKnowledge.category}</span>
                  <span className="text-[8px] font-mono text-white/20">Iteration #{selectedKnowledge.iteration}</span>
                </div>
              </div>
              
              <div className="text-sm text-slate-400 leading-relaxed">
                {selectedKnowledge.description}
              </div>

              {selectedKnowledge.links && selectedKnowledge.links.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[9px] font-black uppercase text-sky-400 tracking-[0.3em]">Grounding Links</div>
                  {selectedKnowledge.links.map((link, i) => (
                    <a key={i} href={link.uri} target="_blank" rel="noopener noreferrer" className="block p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-sky-400/30 transition-all text-sm text-sky-300 hover:text-sky-200">
                      {link.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Controls */}
      <div className="absolute bottom-8 right-8 z-10 flex gap-4">
        <div className="bg-black/60 backdrop-blur-2xl p-2 rounded-2xl border border-white/10 flex">
          <button onClick={() => setIsAuto(true)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAuto ? 'bg-sky-500 text-white shadow-xl shadow-sky-500/20' : 'text-white/30'}`}>Auto-Pilot</button>
          <button onClick={() => setIsAuto(false)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isAuto ? 'bg-white text-slate-950 shadow-xl shadow-white/10' : 'text-white/30'}`}>Manual</button>
        </div>
        <button onClick={runSimulationStep} disabled={isProcessing} className="px-12 h-16 bg-white hover:bg-sky-50 text-slate-950 rounded-[20px] font-black uppercase italic tracking-tighter transition-all shadow-2xl disabled:opacity-50 active:scale-95">Initiate Synthesis</button>
      </div>
    </div>
  );
}

export default App;