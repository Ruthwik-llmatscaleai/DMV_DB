import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
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

// POST /api/chat
app.post('/api/chat', async (req, res) => {
    const { messages } = req.body;
    const GROK_API_KEY = process.env.GROK_API_KEY;

    if (!GROK_API_KEY || GROK_API_KEY === 'your_grok_api_key_here') {
        return res.status(500).json({ error: 'GROK_API_KEY not configured in .env' });
    }

    try {
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
            } catch (e) { console.error('[MCP] listTools error:', e.message); }
        }

        let messagesToLlm = [
            { role: 'system', content: 'You are the DMV Assistant. You have access to BigQuery via MCP tools. Use list_datasets and list_tables to explore before querying. Do NOT use SHOW statements. IMPORTANT: When tools return data, summarize the results in plain, natural English for the user. Do not just show JSON.' },
            ...messages
        ];

        // --- FIRST LLM CALL ---
        let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROK_API_KEY}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messagesToLlm,
                ...(availableTools.length > 0 && { tools: availableTools, tool_choice: 'auto' }),
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('[Groq] API Error:', JSON.stringify(errData, null, 2));
            return res.json({
                role: 'assistant',
                content: `⚠️ (AI Error): ${errData.error?.message || 'The AI failed to generate a response.'}`
            });
        }

        let data = await response.json();
        let msg = data.choices[0].message;

        // --- TOOL EXECUTION LOOP ---
        if (msg.tool_calls?.length > 0) {
            console.log(`[Chat] LLM requested ${msg.tool_calls.length} tool calls.`);
            messagesToLlm.push(msg); // Add assistant's tool call to history

            for (const toolCall of msg.tool_calls) {
                const { function: fn, id: toolCallId } = toolCall;
                const connector = toolToConnector.get(fn.name);

                if (connector) {
                    try {
                        console.log(`[Chat] Executing ${fn.name}...`);
                        const result = await connector.client.callTool({
                            name: fn.name,
                            arguments: JSON.parse(fn.arguments || '{}')
                        });

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
                            content: `Error: ${e.message}`
                        });
                    }
                } else {
                    messagesToLlm.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: `Error: Connector for ${fn.name} not found.`
                    });
                }
            }

            // --- SECOND LLM CALL (Summarization) ---
            console.log(`[Chat] Sending tool results back for summarization...`);
            response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROK_API_KEY}` },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: messagesToLlm
                }),
            });

            if (response.ok) {
                data = await response.json();
                msg = data.choices[0].message;
            } else {
                console.error('[Groq] Second call failed');
            }
        }

        res.json(msg);
    } catch (error) {
        console.error('[Chat] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`DMV Backend running on http://localhost:${PORT}`));