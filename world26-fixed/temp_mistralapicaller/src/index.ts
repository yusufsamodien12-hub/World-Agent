import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  MISTRAL_API_KEY: string;
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for all origins (required for GitHub Pages)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));

// GET /state - Retrieve the saved simulation state
app.get('/state', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT state FROM memory WHERE id = ?')
      .bind('latest')
      .first();
    
    if (!result) return c.json({ state: null });
    return c.json({ state: JSON.parse(result.state as string) });
  } catch (err: any) {
    console.error('Memory Fetch Error:', err);
    return c.json({ error: `Memory Fetch Error: ${err.message}` }, 500);
  }
});

// POST /state - Save the current simulation state
app.post('/state', async (c) => {
  try {
    const { state } = await c.req.json();
    await c.env.DB.prepare('INSERT OR REPLACE INTO memory (id, state, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .bind('latest', JSON.stringify(state))
      .run();
    return c.json({ success: true });
  } catch (err: any) {
    console.error('Memory Save Error:', err);
    return c.json({ error: `Memory Save Error: ${err.message}` }, 500);
  }
});

// POST /v1/chat/completions - Proxy to Mistral AI
// Supports both standard Mistral API format and simplified format
app.post('/v1/chat/completions', async (c) => {
  const apiKey = c.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error('❌ MISTRAL_API_KEY not configured');
    return c.json({ error: 'Configuration Error: Missing API Key' }, 500);
  }

  try {
    const body = await c.req.json();
    
    // Handle both standard Mistral format and simplified format
    let messages;
    if (body.systemInstruction && body.prompt) {
      // Simplified format from frontend
      messages = [
        { role: 'system', content: body.systemInstruction },
        { role: 'user', content: body.prompt }
      ];
    } else if (body.messages) {
      // Standard Mistral format
      messages = body.messages;
    } else {
      return c.json({ error: 'Invalid request format' }, 400);
    }

    const model = body.model || 'mistral-large-latest';
    const temperature = body.temperature || 0.7;
    const maxTokens = body.max_tokens || 2000;
    
    console.log('📤 Proxying request to Mistral AI:', { model, messagesCount: messages.length });
    
    // Forward the request to Mistral AI
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Mistral API error:', response.status, errorData);
      return c.json({ 
        error: `Mistral API Error: ${response.status}`, 
        details: errorData 
      }, 500 as any);
    }

    const data = await response.json();
    console.log('✅ Mistral API response received');
    
    // Return the response from Mistral back to the client
    return c.json(data, response.status as any);
    
  } catch (err: any) {
    console.error('❌ Proxy error:', err);
    return c.json({ error: `Proxy Error: ${err.message}` }, 500);
  }
});

// Root endpoint for health check
app.get('/', (c) => {
  return c.json({ 
    status: 'online', 
    service: 'World26 API Proxy',
    version: '1.0.0',
    endpoints: {
      health: 'GET /',
      chat: 'POST /v1/chat/completions',
      state: {
        get: 'GET /state',
        post: 'POST /state'
      }
    },
    cors: 'enabled',
    message: 'Ready to serve GitHub Pages'
  });
});

export default app;
