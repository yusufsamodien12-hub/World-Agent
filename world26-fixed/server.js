import express from 'express';
import cors from 'cors';
import { Mistral } from '@mistralai/mistralai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_FILE = path.join(__dirname, 'memory.json');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Memory GET endpoint
app.get('/api/state', (req, res) => {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8');
      return res.json({ state: JSON.parse(data) });
    }
    res.json({ state: null });
  } catch (err) {
    res.status(500).json({ error: 'Disk read fault' });
  }
});

// Memory POST endpoint
app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(req.body.state, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Disk write fault' });
  }
});

const mistralApiKey = process.env.MISTRAL_API_KEY;

if (!mistralApiKey) {
  console.error('❌ MISTRAL_API_KEY not set. Development server requires API key.');
}

const client = mistralApiKey ? new Mistral({ apiKey: mistralApiKey }) : null;

app.post('/api/mistral/chat', async (req, res) => {
  if (!client) {
    return res.status(500).json({ error: 'API key not configured. Set MISTRAL_API_KEY environment variable.' });
  }
  
  try {
    const { systemInstruction, prompt, model = 'mistral-large-latest' } = req.body;

    const messages = [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ];

    const chatResponse = await client.chat.complete({
      model: model,
      messages: messages,
      temperature: 0.7,
      maxTokens: 2000
    });

    const responseText = chatResponse.choices?.[0]?.message?.content || '{}';
    
    res.json({ 
      text: responseText,
      success: true 
    });
  } catch (error) {
    console.error('Mistral API Error:', error);
    res.status(500).json({ 
      error: 'Failed to communicate with Mistral API',
      details: error.message 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mistral-proxy' });
});

app.listen(PORT, () => {
  console.log(`🚀 Unified Back-end running on http://localhost:${PORT}`);
});
