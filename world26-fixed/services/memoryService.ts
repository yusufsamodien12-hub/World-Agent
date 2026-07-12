import { SimulationState } from "../src/types";
import { logger } from './logger';

// Use worker's state endpoint in production, local dev server in development,
// or localStorage as a last resort when neither backend is configured.
//
// BUG FIX: this used to always return a truthy string (falling through to
// '/api/state' whenever no proxy was configured), so the `if (!API_BASE)`
// localStorage branches below were dead code -- on a static deploy (e.g.
// GitHub Pages with only a direct Mistral API key, no proxy/server), every
// save/load silently hit a non-existent '/api/state' route, failed, and got
// swallowed by the catch block. Simulation state never persisted. Now we
// only return a network endpoint when one is actually configured.
const getStateEndpoint = (): string | null => {
  const proxyUrl = (import.meta as any)?.env?.VITE_PROXY_URL;

  if (proxyUrl && typeof proxyUrl === 'string' && proxyUrl.includes('workers.dev')) {
    // Cloudflare Worker proxy that also exposes a /state endpoint (see
    // temp_mistralapicaller/src/index.ts).
    const baseUrl = proxyUrl.split('/v1/')[0];
    return `${baseUrl}/state`;
  }

  if (import.meta.env.DEV) {
    // Local dev server (server.js) exposes /api/state, and Vite proxies
    // /api requests to it (see vite.config.ts).
    return '/api/state';
  }

  // No known backend for state persistence -- use localStorage instead.
  return null;
};

const API_BASE = getStateEndpoint();
if (API_BASE) {
  console.log('📍 State endpoint:', API_BASE);
} else {
  console.log('📍 Using localStorage for state persistence');
}

export async function saveSimulationState(state: SimulationState): Promise<void> {
  try {
    // Use localStorage if no API endpoint available
    if (!API_BASE) {
      logger.debug('Memory', '💾 Saving state to localStorage');
      localStorage.setItem('world26_simulation_state', JSON.stringify(state));
      return;
    }
    
    logger.debug('Memory', '💾 Saving state to API', { endpoint: API_BASE });
    
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
    }
  } catch (err) {
    console.error("Failed to persist memory to API, falling back to localStorage:", err);
    // Don't silently lose the user's progress just because the backend is unreachable.
    try {
      localStorage.setItem('world26_simulation_state', JSON.stringify(state));
    } catch (storageErr) {
      console.error("localStorage fallback also failed:", storageErr);
    }
  }
}

export async function loadSimulationState(): Promise<SimulationState | null> {
  try {
    // Use localStorage if no API endpoint available
    if (!API_BASE) {
      logger.debug('Memory', '📂 Loading state from localStorage');
      const stored = localStorage.getItem('world26_simulation_state');
      const result = stored ? JSON.parse(stored) : null;
      logger.info('Memory', result ? '✅ State loaded' : '⚠️ No saved state found');
      return result;
    }
    
    logger.debug('Memory', '📂 Loading state from API', { endpoint: API_BASE });
    
    const resp = await fetch(API_BASE);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.state ?? null;
  } catch (err) {
    console.error("Failed to load memory from API, trying localStorage:", err);
    try {
      const stored = localStorage.getItem('world26_simulation_state');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }
}

