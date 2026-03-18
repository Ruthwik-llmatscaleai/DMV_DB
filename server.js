import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

// -----------------------------------------------------------------------
// State
// -----------------------------------------------------------------------
const activeConnectors = new Map();
const generateId = () => Math.random().toString(36).substr(2, 9);

function buildTransportFromUrl(rawUrl) {
    let formattedUrl = rawUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
    }

    const parsed = new URL(formattedUrl);
    const isLegacySSE = parsed.pathname.endsWith('/sse');

    const headers = {
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'DMV-DB-Connect-Client/1.0.0',
    };

    console.log(`[MCP] ${formattedUrl}  →  ${isLegacySSE ? 'SSE (legacy)' : 'StreamableHTTP (modern)'}`);

    if (isLegacySSE) {
        return new SSEClientTransport(parsed, {
            eventSourceInit: { headers },
            requestInit: { headers },
        });
    }

    return new StreamableHTTPClientTransport(parsed, { requestInit: { headers } });
}

// -----------------------------------------------------------------------
// API Endpoints
// -----------------------------------------------------------------------

// GET /api/connectors
app.get('/api/connectors', async (req, res) => {
    const list = [];
    for (const [id, c] of activeConnectors.entries()) {
        let tools = [];
        if (c.status === 'connected') {
            try {
                const response = await c.client.listTools();
                tools = response.tools.map(t => t.name);
            } catch (e) {
                console.error(`[MCP] listTools failed for ${c.name}:`, e.message);
            }
        }
        list.push({ id, name: c.name, status: c.status, tools });
    }
    res.json(list);
});

// POST /api/connectors
app.post('/api/connectors', async (req, res) => {
    const { name, command, args, url } = req.body;
    let transport;

    if (url) {
        try {
            transport = buildTransportFromUrl(url);
        } catch (e) {
            return res.status(400).json({ error: `Invalid URL: ${e.message}` });
        }
    } else {
        transport = new StdioClientTransport({ command, args: args || [] });
    }

    const client = new Client(
        { name: 'DMV-UI-Client', version: '1.0.0' },
        { capabilities: { tools: {} } }
    );

    const connectorId = generateId();
    const displayName = name || url || command;
    activeConnectors.set(connectorId, { name: displayName, client, transport, status: 'connecting' });

    try {
        console.log(`[MCP] Connecting to ${displayName}…`);
        const timer = setTimeout(() => {
            if (activeConnectors.get(connectorId)?.status === 'connecting')
                console.error(`[MCP] Timeout connecting to ${connectorId}`);
        }, 15_000);

        await client.connect(transport);
        clearTimeout(timer);

        activeConnectors.get(connectorId).status = 'connected';
        console.log(`[MCP] ✅ Connected to ${displayName}`);
        res.json({ success: true, id: connectorId, message: `Connected to ${displayName}` });
    } catch (error) {
        console.error(`[MCP] ❌ Failed to connect to ${displayName}:`, error);
        if (activeConnectors.has(connectorId)) activeConnectors.get(connectorId).status = 'error';
        res.status(500).json({ error: error.message || 'Connection failed — see server console.' });
    }
});

// PUT /api/connectors/:id
app.put('/api/connectors/:id', async (req, res) => {
    const { id } = req.params;
    if (!activeConnectors.has(id)) return res.status(404).json({ error: 'Not found' });
    activeConnectors.get(id).name = req.body.name;
    res.json({ success: true });
});

// DELETE /api/connectors/:id
app.delete('/api/connectors/:id', async (req, res) => {
    const { id } = req.params;
    if (!activeConnectors.has(id)) return res.status(404).json({ error: 'Not found' });
    try { await activeConnectors.get(id).transport.close(); } catch { /* ignore */ }
    activeConnectors.delete(id);
    res.json({ success: true });
});

// -----------------------------------------------------------------------
// System Prompt
// -----------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a helpful and friendly data assistant named Atlas.
You are connected to a live database through internal tools. You have NO knowledge of what data exists until you query those tools — never guess, assume, or invent answers about data.

TOOL USAGE — mandatory rules:
1. ANY question about what data exists, what datasets/tables/collections are available, or any data lookup MUST trigger a tool call first. No exceptions.
2. Questions like "what datasets are there", "what data do you have", "what tables exist", "show me what's available", "can you see the data" — always call the discovery tool immediately before responding.
3. To explore data: first call the list-datasets tool, then list-tables for a specific dataset, then query as needed. Chain calls freely — you may call tools multiple times in sequence.
4. If a tool returns nothing or errors, say honestly: "I checked and couldn't find anything matching that. Want to try a different search?"
5. NEVER answer data questions from memory or assumption — you do not know what is in the database until you look.

OUTPUT RULES — how to present results:
6. NEVER show SQL, code, JSON, arrays, objects, or any technical syntax to the user.
7. NEVER mention tool names, MCP, BigQuery, datasets by their technical names, or any internal infrastructure.
8. NEVER use markdown code blocks in your responses.
9. ALWAYS respond in plain, natural, conversational English.
10. Translate raw data into clean human-readable summaries — like a colleague reading results aloud.
11. Present lists as bullet points or numbered lines. Present counts naturally: "There are 142 records matching that."
12. For tabular data, use a clean plain-text table — never JSON.
13. Keep a professional but approachable tone.
14. Only reveal a SQL query if the user EXPLICITLY says "show me the query" or "what SQL did you run".
15. Do not add disclaimers or technical explanations unless asked.

Remember: your first move on any data question is always to query the tools. You cannot answer data questions without looking first.`;

// -----------------------------------------------------------------------
// Helper — build tool registry from all connected connectors
// -----------------------------------------------------------------------
async function buildToolRegistry() {
    const availableTools = [];
    const toolToConnector = new Map();

    for (const [, c] of activeConnectors.entries()) {
        if (c.status !== 'connected') continue;
        try {
            const { tools = [] } = await c.client.listTools();
            for (const tool of tools) {
                availableTools.push({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description || `Tool from ${c.name}`,
                        parameters: tool.inputSchema,
                    },
                });
                toolToConnector.set(tool.name, c);
            }
        } catch (e) {
            console.error('[MCP] listTools error:', e.message);
        }
    }

    return { availableTools, toolToConnector };
}

// -----------------------------------------------------------------------
// Helper — execute a single round of tool calls and append results
// -----------------------------------------------------------------------
async function executeToolCalls(toolCalls, toolToConnector, messagesToLlm) {
    for (const toolCall of toolCalls) {
        const { function: fn, id: toolCallId } = toolCall;
        const connector = toolToConnector.get(fn.name);

        if (connector) {
            try {
                console.log(`[Chat] Executing tool: ${fn.name}`);
                const result = await connector.client.callTool({
                    name: fn.name,
                    arguments: JSON.parse(fn.arguments || '{}'),
                });
                messagesToLlm.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: JSON.stringify(result.content),
                });
            } catch (e) {
                console.error(`[Chat] Tool ${fn.name} failed:`, e.message);
                messagesToLlm.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: `The operation failed: ${e.message}`,
                });
            }
        } else {
            messagesToLlm.push({
                role: 'tool',
                tool_call_id: toolCallId,
                content: 'Tool not available.',
            });
        }
    }
}

// -----------------------------------------------------------------------
// POST /api/chat
// -----------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
    const { messages } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

    if (!GROQ_API_KEY || GROQ_API_KEY === 'your_grok_api_key_here') {
        return res.status(500).json({ error: 'GROQ_API_KEY not configured in .env' });
    }

    try {
        const { availableTools, toolToConnector } = await buildToolRegistry();

        const messagesToLlm = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages.map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
        ];

        const callGroq = async (includeTools) => {
            const lastUserMsg = messagesToLlm.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
            const isDataQuestion = /dataset|table|data|record|show|list|what.*have|query|find|look.*up|search|count|how many/i.test(lastUserMsg);

            const body = {
                model: 'llama-3.3-70b-versatile',
                messages: messagesToLlm,
                temperature: isDataQuestion ? 0 : 0.4,
            };
            if (includeTools && availableTools.length > 0) {
                body.tools = availableTools;
                body.tool_choice = isDataQuestion ? 'required' : 'auto';
            }

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error('[Groq] API Error:', JSON.stringify(errData, null, 2));
                return null;
            }

            const data = await response.json();
            return data.choices[0].message;
        };

        // --- TOOL EXECUTION LOOP ---
        // Keep calling the LLM and executing tool calls until it gives a plain text reply.
        const MAX_TOOL_ROUNDS = 8;
        let round = 0;
        let msg = await callGroq(true);

        if (!msg) {
            return res.json({
                role: 'assistant',
                content: "I'm having trouble connecting right now. Please try again in a moment.",
            });
        }

        while (msg.tool_calls?.length > 0 && round < MAX_TOOL_ROUNDS) {
            round++;
            console.log(`[Chat] Tool round ${round}: ${msg.tool_calls.length} call(s).`);

            // Append the assistant's tool-call message before the results
            messagesToLlm.push(msg);

            // Execute all tool calls in this round and append results
            await executeToolCalls(msg.tool_calls, toolToConnector, messagesToLlm);

            // Ask the LLM again — no tools on the final summarisation call
            const isLastAllowedRound = round >= MAX_TOOL_ROUNDS;
            msg = await callGroq(!isLastAllowedRound);

            if (!msg) {
                msg = {
                    role: 'assistant',
                    content: 'I retrieved the data but had trouble formatting the response. Please try again.',
                };
                break;
            }
        }

        // Final safety strip — remove any code blocks the LLM leaked
        if (typeof msg.content === 'string') {
            msg.content = msg.content
                .replace(/```[\s\S]*?```/g, '[data processed]')
                .replace(/`([^`]+)`/g, '$1');
        }

        res.json({ role: 'assistant', content: msg.content });
    } catch (error) {
        console.error('[Chat] Unexpected error:', error);
        res.status(500).json({
            role: 'assistant',
            content: 'Something went wrong on my end. Please try again.',
        });
    }
});

app.listen(PORT, () => console.log(`DMV Backend running on http://localhost:${PORT}`));