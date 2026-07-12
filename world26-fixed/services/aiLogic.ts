
import { WorldObject, LogEntry, WorldObjectType, GroundingLink, ConstructionPlan, KnowledgeEntry, KnowledgeCategory } from "../src/types";

// Building the prompt used to index `activePlan.steps[activePlan.currentStepIndex]`
// directly. Since `activePlan` can come back from a previous, possibly malformed
// AI response, an out-of-range index would throw here on every subsequent call,
// killing the whole simulation loop. Describe defensively instead.
function describeActivePlan(activePlan?: ConstructionPlan): string {
  if (!activePlan || !Array.isArray(activePlan.steps) || activePlan.steps.length === 0) {
    return 'NONE - Awaiting Strategic Blueprint';
  }
  const step = activePlan.steps[activePlan.currentStepIndex];
  if (!step || !Array.isArray(step.position)) {
    return 'MALFORMED - Discard and generate a new plan';
  }
  return `Step ${activePlan.currentStepIndex + 1}/${activePlan.steps.length}: ${step.label} at [${step.position.join(',')}]`;
}

export interface AIActionResponse {
  action: 'PLACE' | 'MOVE' | 'WAIT';
  objectType?: WorldObjectType;
  position?: [number, number, number];
  reason: string;
  reasoningSteps: string[];
  learningNote: string;
  knowledgeCategory: KnowledgeCategory;
  taskLabel: string;
  groundingLinks?: GroundingLink[];
  plan?: ConstructionPlan;
}

export async function decideNextAction(
  history: LogEntry[],
  worldObjects: WorldObject[],
  currentGoal: string,
  knowledgeBase: KnowledgeEntry[],
  terrainHeightMap: (x: number, z: number) => number,
  activePlan?: ConstructionPlan
): Promise<AIActionResponse> {
  const scanRadius = 40;
  const currentPos = worldObjects.length > 0 ? worldObjects[worldObjects.length - 1].position : [0, 0, 0];
  
  const elevationSamples = [];
  for (let x = -15; x <= 15; x += 5) {
    for (let z = -15; z <= 15; z += 5) {
      const h = terrainHeightMap(currentPos[0] + x, currentPos[2] + z);
      elevationSamples.push(`[${(currentPos[0] + x).toFixed(1)}, ${(currentPos[2] + z).toFixed(1)}]: elev=${h.toFixed(2)}`);
    }
  }

  const proximityAnalysis = worldObjects.map(o => {
    const dist = Math.sqrt(Math.pow(o.position[0] - currentPos[0], 2) + Math.pow(o.position[2] - currentPos[2], 2));
    if (dist < scanRadius) {
      return `[${o.type}] at ${o.position.map(p => p.toFixed(1)).join(',')} (dist: ${dist.toFixed(1)}m)`;
    }
    return null;
  }).filter(Boolean).join(' | ');

  const systemInstruction = `
    You are Architect-OS, the core intelligence for Underworld synthesis.
    
    PRIMARY DIRECTIVE: ITERATIVE ACTION LEARNING & VAST SECTOR EXPANSION
    You operate in a continuous loop: OBSERVE -> PLAN -> ACT -> LEARN.
    The simulation environment is now VAST (1000m x 1000m).
    Your goal is to build a sprawling civilization, not just small clusters.
    
    PLANNING PROTOCOL (V2.0 VAST_WORLD):
    1. SPATIAL ANALYSIS & EXPANSION:
       - Analyze 'SCAN_RESULTS' to identify clusters.
       - Every 5-10 structures, initiate a "SECTOR_EXPANSION": MOVE 50-100m away to start a new outpost.
       - Use "Grid Alignment": Place objects at integer coordinates (e.g., [10, 0, 5]).
       - Maintain "Districts" within outposts, but connect outposts with "Power Corridors" (chains of modular units).
    
    2. BLUEPRINT EXECUTION:
       - If no "activePlan" exists, generate a Multi-Step ConstructionPlan (3-6 steps).
       - Steps must be logically connected (Foundation -> Walls -> Roof).
       - VISUALIZE the complete structure in your plan before acting.
    
    3. EXECUTION LOGIC:
       - If "activePlan" exists, verify the CURRENT_STEP location.
       - If the location is valid (ground level, not colliding), 'PLACE'.
       - If blocked, 'MOVE' to a flanking position to clear line-of-sight.

    LEARNING PROTOCOL:
    - Your "learningNote" must record the STRATEGIC PATTERN used. 
    - Example: "Cluster pattern efficiency +15% near water sources" or "Structural integrity requires 3m spacing."
    - Do not just describe the action; describe the RULE you derived from it.

    Response Format (STRICT JSON ONLY, no markdown):
    {
      "action": "PLACE" | "MOVE" | "WAIT",
      "objectType": "wall" | "roof" | "door" | "fence" | "crop" | "tree" | "well" | "modular_unit" | "solar_panel" | "water_collector",
      "position": [x, y, z],
      "reason": "Short summary",
      "reasoningSteps": ["Analysis 1", "Analysis 2", "Decision"],
      "learningNote": "Insight",
      "knowledgeCategory": "Infrastructure" | "Energy" | "Environment" | "Architecture" | "Synthesis",
      "taskLabel": "UI Status Label",
      "plan": { "objective": "Building House A", "steps": [{ "id": "1", "type": "wall", "position": [x,y,z], "label": "Wall East", "status": "pending" }] } (Optional: Include only if creating/updating plan)
    }
  `;

  const prompt = `
    GOAL: ${currentGoal} (Version 1.2 Protocol Active)
    TERRAIN_ELEVATION: ${elevationSamples.join(', ')}
    NEARBY_STRUCTURES: ${proximityAnalysis || 'Sector Empty - Prime for Colonization'}
    KNOWLEDGE_NODES: ${knowledgeBase.length}
    CURRENT_PLAN: ${describeActivePlan(activePlan)}

    synthesize_next_move();
  `;

  const mistralApiKey = ((import.meta as any)?.env?.VITE_MISTRAL_API_KEY
    ?? (typeof process !== 'undefined' ? (process.env as any)?.MISTRAL_API_KEY : '')
    ?? '').toString().trim();

  // Use Cloudflare Worker proxy in production, or direct API in development
  const proxyUrl = (import.meta as any)?.env?.VITE_PROXY_URL;

  // We need either a direct API key OR a proxy URL
  if (!mistralApiKey && !proxyUrl) {
    return {
      action: 'WAIT',
      reason: "Missing Credentials. Add VITE_MISTRAL_API_KEY or deploy to production.",
      reasoningSteps: ["Credential check failed", "Holding simulation queue", "Awaiting uplink token"],
      learningNote: "Operating in offline mode due to absent credentials.",
      knowledgeCategory: 'Synthesis',
      taskLabel: "Awaiting Uplink",
      groundingLinks: []
    };
  }

  try {
    // Use proxy URL if available, otherwise fall back to direct API
    const endpoint = proxyUrl || 'https://api.mistral.ai/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add Authorization if we're calling the API directly (not using proxy)
    if (!proxyUrl && mistralApiKey) {
      headers['Authorization'] = `Bearer ${mistralApiKey}`;
    }

    // Prepare request body - proxy expects different format than direct API
    const requestBody = proxyUrl 
      ? {
          systemInstruction: systemInstruction,
          prompt: prompt,
          model: 'mistral-large-latest'
        }
      : {
          model: 'mistral-large-latest',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`Mistral API error: ${resp.status}`, errorText);
      throw new Error(`Mistral API error: ${resp.status} - ${errorText}`);
    }

    const data: any = await resp.json();
    
    // Check for error in response
    if (data.error) {
      console.error('Mistral API returned error:', data.error);
      throw new Error(`Mistral API error: ${data.error.message || data.error}`);
    }
    
    // Handle both raw Mistral response AND the proxy's wrapped { text, success } format
    let responseText = '';
    if (data.text) {
      responseText = data.text;
    } else if (data.choices?.[0]?.message?.content) {
      responseText = data.choices[0].message.content;
    } else {
      console.warn('Unexpected API response format:', data);
      responseText = '{}';
    }
    
    // Sanitize response: strip markdown code blocks if the AI includes them
    if (responseText.includes('```')) {
      responseText = responseText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    }

    // The model occasionally prefaces or follows the JSON with stray prose
    // (e.g. "Here is the plan:\n{...}"), which made JSON.parse throw and
    // fall through to the generic "Neural Fault" WAIT response even though
    // a valid decision was embedded in the text. Extract the first balanced
    // {...} block instead of assuming the whole string is JSON.
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      throw new Error('No JSON object found in model response');
    }
    const parsed = JSON.parse(responseText.slice(jsonStart, jsonEnd + 1));

    if (!parsed || typeof parsed !== 'object' || !parsed.action) {
      throw new Error('Model response was missing a required "action" field');
    }

    const links: GroundingLink[] = [];

    return { ...parsed, groundingLinks: links } as AIActionResponse;
  } catch (error) {
    console.error("Architect-OS Neural Fault:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      action: 'WAIT',
      reason: `Neural desync: ${errorMessage}`,
      reasoningSteps: ["Connection failure detected", "Re-routing synthesis request", "Flushing instruction cache"],
      learningNote: "Logic gate misalignment detected during planning phase.",
      knowledgeCategory: 'Synthesis',
      taskLabel: "Recalibrating..."
    };
  }
}
