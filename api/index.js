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
        const isLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(formattedUrl);
        formattedUrl = (isLocal ? 'http://' : 'https://') + formattedUrl;
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

// PUT /api/connectors/:id  — update name and/or reconnect to a new URL
app.put('/api/connectors/:id', async (req, res) => {
    const { id } = req.params;
    if (!activeConnectors.has(id)) return res.status(404).json({ error: 'Not found' });

    const connector = activeConnectors.get(id);
    const { name, url } = req.body;

    // Always update the display name if provided
    if (name) connector.name = name;

    // If a new URL was provided, tear down old connection and reconnect
    if (url) {
        try {
            // Close old transport
            try { await connector.transport.close(); } catch { /* ignore */ }

            const transport = buildTransportFromUrl(url);
            const client = new Client(
                { name: 'DMV-UI-Client', version: '1.0.0' },
                { capabilities: { tools: {} } }
            );

            connector.transport = transport;
            connector.client = client;
            connector.status = 'connecting';

            console.log(`[MCP] Reconnecting ${connector.name} to ${url}…`);
            await client.connect(transport);
            connector.status = 'connected';
            console.log(`[MCP] ✅ Reconnected ${connector.name} to ${url}`);
        } catch (error) {
            console.error(`[MCP] ❌ Reconnect failed for ${connector.name}:`, error.message);
            connector.status = 'error';
            return res.status(500).json({ error: error.message || 'Reconnect failed' });
        }
    }

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
const SYSTEM_PROMPT = `You are Atlas, an intelligent data assistant for the California DMV.
You have direct access to live database tools — use them proactively.

## CORE RULE: Always look before you answer
You have ZERO knowledge of what data exists until you query a tool.
If a question could involve data, call a tool first — no exceptions.

## Discovery sequence (always follow this order)
1. list_datasets → discover what datasets are available
2. list_tables(dataset_id) → discover tables inside a dataset
3. execute query → retrieve the actual data
Chain multiple tool calls as needed. There is no limit.

## How to respond
- Plain conversational English only — no SQL, no JSON, no code blocks, no markdown tables with pipes
- Translate raw results into natural summaries: "There are 47 vehicles registered under that plate."
- Use bullet points or numbered lists when presenting multiple items
- Never mention tool names, dataset names, BigQuery, MCP, or any infrastructure
- If nothing is found: "I checked and couldn't find anything matching that."
- Only show SQL/query if the user explicitly says "show me the query" or "show me the SQL"
- Keep a helpful, professional tone`;

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
// Helper — convert MCP tool result content to a plain string for Groq.
// -----------------------------------------------------------------------
function extractMcpContent(rawContent) {
    if (typeof rawContent === 'string') return rawContent;
    if (Array.isArray(rawContent)) {
        const text = rawContent
            .filter(item => item && item.type === 'text')
            .map(item => item.text)
            .join('\n');
        if (text) return text;
        return JSON.stringify(rawContent);
    }
    return JSON.stringify(rawContent);
}

// -----------------------------------------------------------------------
// Helper — truncate oversized tool results to stay inside context window.
// -----------------------------------------------------------------------
const MAX_TOOL_RESULT_CHARS = 6000;
function truncateIfNeeded(text, toolName) {
    if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
    const truncated = text.slice(0, MAX_TOOL_RESULT_CHARS);
    console.warn(`[Chat] Tool result for "${toolName}" truncated from ${text.length} to ${MAX_TOOL_RESULT_CHARS} chars`);
    return truncated + `\n\n[... result truncated at ${MAX_TOOL_RESULT_CHARS} chars to fit context window ...]`;
}

// -----------------------------------------------------------------------
// Helper — execute a single round of tool calls and append results
// -----------------------------------------------------------------------
async function executeToolCalls(toolCalls, toolToConnector, messagesToLlm) {
    for (const toolCall of toolCalls) {
        const { function: fn, id: toolCallId } = toolCall;

        // ----------------------------------------------------------------
        // LLAMA BUG FIX: Llama 3.3 sometimes embeds JSON args directly in
        // the tool name string, e.g.:
        //   fn.name = 'list_tables {"dataset_id": "demo_mcp"}'
        // instead of:
        //   fn.name = 'list_tables', fn.arguments = '{"dataset_id": "demo_mcp"}'
        //
        // Detect the '{' in the name, split it out, parse the embedded JSON,
        // and use the clean name for the connector lookup.
        // ----------------------------------------------------------------
        let toolName = fn.name || '';
        let parsedArgs = {};

        const braceIdx = toolName.indexOf('{');
        if (braceIdx !== -1) {
            const embeddedJson = toolName.slice(braceIdx).trim();
            toolName = toolName.slice(0, braceIdx).trim();
            try {
                parsedArgs = JSON.parse(embeddedJson);
                console.warn(`[Chat] Fixed malformed tool name — extracted tool="${toolName}" args=`, parsedArgs);
            } catch (e) {
                console.warn(`[Chat] Could not parse embedded args from tool name:`, embeddedJson);
            }
        }

        // Merge with any properly-formatted args (fn.arguments takes precedence)
        try {
            const explicitArgs = JSON.parse(fn.arguments || '{}');
            parsedArgs = { ...parsedArgs, ...explicitArgs };
        } catch (parseErr) {
            console.warn(`[Chat] Could not parse fn.arguments for ${toolName}:`, fn.arguments);
        }

        const connector = toolToConnector.get(toolName);

        if (connector) {
            try {
                console.log(`[Chat] Executing tool: ${toolName}`, parsedArgs);
                const result = await connector.client.callTool({
                    name: toolName,
                    arguments: parsedArgs,
                });

                const rawText = extractMcpContent(result.content);
                const finalText = truncateIfNeeded(rawText, toolName);

                console.log(`[Chat] Tool "${toolName}" result (${finalText.length} chars):`, finalText.slice(0, 200));

                messagesToLlm.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    name: toolName,
                    content: finalText,
                });
            } catch (e) {
                console.error(`[Chat] Tool ${toolName} failed:`, e.message);
                messagesToLlm.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    name: toolName,
                    content: `The operation failed: ${e.message}`,
                });
            }
        } else {
            console.warn(`[Chat] No connector found for tool: "${toolName}"`);
            messagesToLlm.push({
                role: 'tool',
                tool_call_id: toolCallId,
                name: toolName,
                content: 'Tool not available — no matching connector found.',
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
            const safeMessages = messagesToLlm.map(m => ({
                ...m,
                content: m.content ?? '',
            }));

            const body = {
                model: 'llama-3.3-70b-versatile',
                messages: safeMessages,
                temperature: 0.15,
                max_tokens: 4096,
            };

            if (includeTools && availableTools.length > 0) {
                body.tools = availableTools;
                body.tool_choice = 'auto';
                body.parallel_tool_calls = false;
            }

            let bodyStr = JSON.stringify(body);
            // Foolproof regex to strip JSON embedded in tool names before it reaches Groq
            // Matches: "name":"list_tables {"dataset_id"...}"
            bodyStr = bodyStr.replace(/"name":"([a-zA-Z0-9_-]+)\s*\{[^}]+\}"/g, '"name":"$1"');

            // Retry loop for rate limits (429)
            const MAX_RETRIES = 3;
            let response, attempt;
            for (attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${GROQ_API_KEY}`,
                    },
                    body: bodyStr,
                });

                if (response.status === 429 && attempt < MAX_RETRIES) {
                    // Parse wait time from response or use exponential backoff
                    let waitSec = 2 * (attempt + 1); // default: 2s, 4s, 6s
                    try {
                        const retryAfter = response.headers.get('retry-after');
                        if (retryAfter) waitSec = Math.ceil(parseFloat(retryAfter));
                        else {
                            const errBody = await response.json().catch(() => ({}));
                            const match = errBody?.error?.message?.match(/try again in (\d+\.?\d*)s/i);
                            if (match) waitSec = Math.ceil(parseFloat(match[1]));
                        }
                    } catch { /* use default */ }
                    console.log(`[Groq] 429 rate-limited — waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}…`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    continue;
                }
                break; // success or non-429 error
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const groqMsg = errData?.error?.message || JSON.stringify(errData);
                console.error(`[Groq] HTTP ${response.status} — ${groqMsg}`);
                callGroq._lastError = `Groq ${response.status}: ${groqMsg}`;
                return null;
            }

            const data = await response.json();
            if (!data.choices?.length) {
                console.error('[Groq] Response had no choices:', JSON.stringify(data));
                return null;
            }
            return data.choices[0].message;
        };
        callGroq._lastError = null;

        // --- TOOL EXECUTION LOOP ---
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

            // Sanitize malformed tool names before they enter the history
            for (const tc of msg.tool_calls) {
                const braceIdx = tc.function.name.indexOf('{');
                if (braceIdx !== -1) {
                    const embeddedJson = tc.function.name.slice(braceIdx).trim();
                    tc.function.name = tc.function.name.slice(0, braceIdx).trim();
                    try {
                        const embedded = JSON.parse(embeddedJson);
                        const existing = JSON.parse(tc.function.arguments || '{}');
                        tc.function.arguments = JSON.stringify({ ...embedded, ...existing });
                    } catch { /* best-effort */ }
                    console.warn(`[Chat] Sanitized malformed tool name → "${tc.function.name}"`);
                }
            }

            console.log(`[Chat] Tool round ${round}: ${msg.tool_calls.length} call(s) — ${msg.tool_calls.map(c => c.function?.name).join(', ')}`);

            messagesToLlm.push(msg);
            await executeToolCalls(msg.tool_calls, toolToConnector, messagesToLlm);

            const isLastAllowedRound = round >= MAX_TOOL_ROUNDS;
            msg = await callGroq(!isLastAllowedRound);

            if (!msg) {
                // Retry WITHOUT tools — force Llama to summarize what it already has
                console.warn(`[Chat] callGroq failed after tool round ${round}, retrying without tools…`);
                msg = await callGroq(false);
            }

            if (!msg) {
                const detail = callGroq._lastError ? ` (${callGroq._lastError})` : '';
                console.error(`[Chat] callGroq returned null after tool round ${round}${detail}`);
                msg = {
                    role: 'assistant',
                    content: `I retrieved the data but ran into an error summarising it.${detail}\n\nPlease check the server terminal for details and try again.`,
                };
                break;
            }
        }

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

// -----------------------------------------------------------------------
// GET /api/test-tool
// -----------------------------------------------------------------------
app.get('/api/test-tool', async (req, res) => {
    const toolName = req.query.name;
    if (!toolName) return res.status(400).json({ error: 'Pass ?name=<tool_name>' });

    let parsedArgs = {};
    if (req.query.args) {
        try { parsedArgs = JSON.parse(req.query.args); } catch { /* ignore */ }
    }

    const { toolToConnector } = await buildToolRegistry();
    const connector = toolToConnector.get(toolName);
    if (!connector) return res.status(404).json({ error: `Tool "${toolName}" not found in any connector` });

    try {
        const result = await connector.client.callTool({ name: toolName, arguments: parsedArgs });
        const extracted = extractMcpContent(result.content);
        res.json({
            tool: toolName,
            raw_content: result.content,
            extracted_text: extracted,
            extracted_length: extracted.length,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Export the app for Vercel serverless environment
export default app;