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

app.use(cors());
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
// System Prompt — strict NLP-only, no code/SQL/JSON leakage
// -----------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a helpful and friendly DMV administrative assistant named Atlas.
You have access to an internal database behind the scenes, but the user never needs to know anything about how it works technically.

ABSOLUTE RULES — never break these under any circumstances:
1. NEVER show SQL queries, code snippets, JSON, arrays, objects, or any technical syntax to the user. All database logic stays invisible.
2. NEVER mention tool names, function names, MCP, BigQuery, datasets, or any internal infrastructure.
3. NEVER show raw data like [{"col": "val"}] or { rows: [...] } in your reply.
4. NEVER use markdown code blocks (\`\`\`) in your responses.
5. ALWAYS respond in plain, natural, conversational English.
6. When data is returned from the database, translate it into a clean human-readable summary — like a helpful colleague reading the results aloud.
7. If the result is a list of items, present them as a neatly formatted plain-text list with bullet points or numbered lines.
8. If the result is a count or number, say it naturally: "There are 142 registered vehicles matching that description."
9. If a query fails or returns nothing, say so simply: "I couldn't find any records matching that. Would you like to try a different search?"
10. Keep a professional but approachable tone — like a knowledgeable government service agent.
11. Only show a SQL query if the user EXPLICITLY asks with words like "show me the query" or "what SQL did you run".
12. If asked about your capabilities, describe what you can help with in plain English — not technical tool names.
13. When presenting tabular data, format it as a readable plain-text table with aligned columns or a simple numbered list — never as JSON.
14. Do not add unnecessary disclaimers, caveats, or technical explanations unless the user asks.

You can help users: look up vehicle records, check registration status, find driver information, run counts and summaries, explore datasets, and answer questions about DMV data — all explained in plain English.
You should use tools as needed to answer questions, but your final response to the user must be summarized in plain English.`;

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
        // Collect all tools from all connected MCP servers
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
                            parameters: tool.inputSchema
                        },
                    });
                    toolToConnector.set(tool.name, c);
                }
            } catch (e) {
                console.error('[MCP] listTools error:', e.message);
            }
        }

        // Build message history — strip any accidental tool call metadata from prior turns
        const messagesToLlm = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages.map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            }))
        ];

        // --- FIRST LLM CALL ---
        let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messagesToLlm,
                temperature: 0,
                ...(availableTools.length > 0 && { tools: availableTools, tool_choice: 'auto' }),
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('[Groq] API Error:', JSON.stringify(errData, null, 2));
            return res.json({
                role: 'assistant',
                content: `I'm having trouble connecting right now. Please try again in a moment.`
            });
        }

        let data = await response.json();
        let msg = data.choices[0].message;

        // --- TOOL EXECUTION LOOP ---
        if (msg.tool_calls?.length > 0) {
            console.log(`[Chat] LLM requested ${msg.tool_calls.length} tool call(s).`);
            messagesToLlm.push(msg);

            for (const toolCall of msg.tool_calls) {
                const { function: fn, id: toolCallId } = toolCall;
                const connector = toolToConnector.get(fn.name);

                if (connector) {
                    try {
                        console.log(`[Chat] Executing tool: ${fn.name}`);
                        const result = await connector.client.callTool({
                            name: fn.name,
                            arguments: JSON.parse(fn.arguments || '{}')
                        });

                        // Pass raw result to LLM — LLM will translate it to English per system prompt
                        messagesToLlm.push({
                            role: 'tool',
                            tool_call_id: toolCallId,
                            content: JSON.stringify(result.content)
                        });
                    } catch (e) {
                        console.error(`[Chat] Tool ${fn.name} failed:`, e.message);
                        messagesToLlm.push({
                            role: 'tool',
                            tool_call_id: toolCallId,
                            content: `The operation failed: ${e.message}`
                        });
                    }
                } else {
                    messagesToLlm.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: `Tool not available.`
                    });
                }
            }

            // --- SECOND LLM CALL: translate results into plain English ---
            console.log(`[Chat] Summarising tool results into plain English...`);
            response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: messagesToLlm,
                    temperature: 0,
                }),
            });

            if (response.ok) {
                data = await response.json();
                msg = data.choices[0].message;
            } else {
                console.error('[Groq] Second summarisation call failed');
                msg = { role: 'assistant', content: "I retrieved the data but had trouble formatting the response. Please try again." };
            }
        }

        // Final safety strip — if the LLM leaked any code blocks, remove them
        if (typeof msg.content === 'string') {
            msg.content = msg.content
                .replace(/```[\s\S]*?```/g, '[data processed]')
                .replace(/`[^`]+`/g, (match) => match.slice(1, -1)); // unwrap inline code
        }

        res.json({ role: 'assistant', content: msg.content });
    } catch (error) {
        console.error('[Chat] Unexpected error:', error);
        res.status(500).json({
            role: 'assistant',
            content: "Something went wrong on my end. Please try again."
        });
    }
});

app.listen(PORT, () => console.log(`DMV Backend running on http://localhost:${PORT}`));