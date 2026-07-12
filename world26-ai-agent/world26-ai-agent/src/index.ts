import express from 'express';
import cors from 'cors';
import { decideNextAction } from './aiLogic';
import type { WorldObject, LogEntry, KnowledgeEntry, ConstructionPlan } from './worldTypes';

// ---------------------------------------------------------------------------
// world26-ai-agent
//
// A standalone AI project that drives the world26-playground. It knows
// nothing about React or Three.js — it just receives a JSON snapshot of the
// world and returns a decision (PLACE / MOVE / WAIT). Point the playground's
// AGENT_URL env var at wherever this is running.
//
// Contract:
//   POST /decide
//   body: { logs, objects, currentGoal, knowledgeBase, activePlan }
//   -> AIActionResponse JSON
//
// Because this is a separate project, you can swap it for a different AI
// project entirely (different model, different provider, a rules-based bot,
// a human-in-the-loop tool) without touching the playground at all.
// ---------------------------------------------------------------------------

interface DecideRequestBody {
  logs: LogEntry[];
  objects: WorldObject[];
  currentGoal: string;
  knowledgeBase: KnowledgeEntry[];
  activePlan?: ConstructionPlan;
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/decide', async (req, res) => {
  try {
    const { logs, objects, currentGoal, knowledgeBase, activePlan } = req.body as DecideRequestBody;

    if (!Array.isArray(objects) || typeof currentGoal !== 'string') {
      return res.status(400).json({ error: 'Invalid world snapshot: expected { logs, objects, currentGoal, knowledgeBase, activePlan? }' });
    }

    const decision = await decideNextAction(
      logs ?? [],
      objects,
      currentGoal,
      knowledgeBase ?? [],
      activePlan
    );

    res.json(decision);
  } catch (error) {
    console.error('Agent decision failed:', error);
    res.status(500).json({
      error: 'Agent decision failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'world26-ai-agent' });
});

app.listen(PORT, () => {
  console.log(`🤖 world26-ai-agent listening on http://localhost:${PORT}`);
  console.log(`   Point the playground's AGENT_URL at this address.`);
});
