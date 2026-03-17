import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { z } from 'zod';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const PORT = 3001;

// Global state for connected MCP clients
// Map<string, { client: Client, transport: StdioClientTransport, status: string, name: string }>
const activeConnectors = new Map();

// Generate a random ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// ----------------------------------------------------------------------
// MCP Connectors API
// ----------------------------------------------------------------------

// Get all connectors and their tools
app.get('/api/connectors', async (req, res) => {
    const connectorsList = [];

    for (const [id, connector] of activeConnectors.entries()) {
        let tools = [];
        if (connector.status === 'connected') {
            try {
                // Use official SDK method with a 3s timeout
                const toolsPromise = connector.client.listTools();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));

                const toolsResponse = await Promise.race([toolsPromise, timeoutPromise]);

                if (toolsResponse && toolsResponse.tools) {
                    tools = toolsResponse.tools.map(t => t.name);
                }
            } catch (e) {
                console.error(`Error fetching tools for ${connector.name}:`, e.message);
                if (e.message === 'Timeout') {
                    // Maybe connection is stale?
                }
            }
        }

        connectorsList.push({
            id,
            name: connector.name,
            status: connector.status,
            tools
        });
    }

    res.json(connectorsList);
});

// Add a new connector (Supports stdio command or SSE URL)
app.post('/api/connectors', async (req, res) => {
    const { name, command, args, url } = req.body;
    console.log("Adding connector:", { name, command, args, url });

    if (!command && !url) {
        return res.status(400).json({ error: "Either command or url is required" });
    }

    const id = generateId();
    let transport;

    if (url) {
        // SSE Transport for links
        try {
            let formattedUrl = url;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                formattedUrl = 'http://' + url;
            }
            console.log(`[MCP] Initializing SSE transport for: ${formattedUrl}`);

            // Add ngrok bypass header if it's an ngrok URL
            const headers = {
                'ngrok-skip-browser-warning': 'AnyValueIsFine',
                'User-Agent': 'DMV-DB-Connect-Client/1.0.0'
            };

            console.log(`[MCP] 🔧 Setting custom headers:`, headers);

            transport = new SSEClientTransport(new URL(formattedUrl), {
                eventSourceInit: { headers }, // For EventSource
                requestInit: { headers }      // For subsequent POSTs
            });
        } catch (e) {
            console.error("Invalid URL format:", url);
            return res.status(400).json({ error: "Invalid URL format. Please include http:// or https://" });
        }
    } else {
        // Stdio Transport for local processes
        console.log(`Initializing Stdio transport for: ${command} ${args.join(' ')}`);
        transport = new StdioClientTransport({
            command,
            args: args || [],
        });
    }

    const client = new Client({
        name: "DMV-UI-Client",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {} // Specifically request tool support
        }
    });

    const connectorId = id;
    activeConnectors.set(connectorId, { name: name || (url || command), client, transport, status: 'connecting' });

    try {
        console.log(`[MCP] Connecting to ${name || url || command} (ID: ${connectorId})...`);
        const connectionTimeout = setTimeout(() => {
            if (activeConnectors.get(connectorId)?.status === 'connecting') {
                console.error(`[MCP] ❌ Connection TIMEOUT for ${connectorId}`);
            }
        }, 15000);

        await client.connect(transport);
        clearTimeout(connectionTimeout);

        activeConnectors.get(connectorId).status = 'connected';
        console.log(`[MCP] ✅ SUCCESSFULLY CONNECTED to ${name || url || command}`);
        res.json({ success: true, id: connectorId, message: `Connected to ${name || (url || command)}` });
    } catch (error) {
        console.error(`[MCP] ❌ FAILED to connect to ${name || url || command}:`, error);
        if (activeConnectors.has(connectorId)) {
            activeConnectors.get(connectorId).status = 'error';
        }
        res.status(500).json({ error: error.message || "Connection failed. Check server console." });
    }
});

// Update/Edit a connector
app.put('/api/connectors/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (activeConnectors.has(id)) {
        const conn = activeConnectors.get(id);
        conn.name = name;
        activeConnectors.set(id, conn);
        console.log(`[MCP] Renamed connector ${id} to "${name}"`);
        return res.json({ success: true });
    }

    res.status(404).json({ error: "Connector not found" });
});

// Remove a connector
app.delete('/api/connectors/:id', async (req, res) => {
    const { id } = req.params;
    if (activeConnectors.has(id)) {
        const { transport } = activeConnectors.get(id);
        try {
            await transport.close();
            console.log(`[MCP] 🛑 Disconnected and removed connector: ${id}`);
        } catch (e) {
            console.error(`[MCP] Error closing transport for ${id}:`, e);
        }
        activeConnectors.delete(id);
        return res.json({ success: true });
    }
    res.status(404).json({ error: "Connector not found" });
});


// ----------------------------------------------------------------------
// Chat & Grok Integration API
// ----------------------------------------------------------------------

app.post('/api/chat', async (req, res) => {
    const { messages } = req.body;
    const GROK_API_KEY = process.env.GROK_API_KEY;

    if (!GROK_API_KEY || GROK_API_KEY === 'your_grok_api_key_here') {
        return res.status(500).json({
            error: "GROK_API_KEY is not configured in the backend .env file."
        });
    }

    try {
        // 1. Collect all available tools from all active connectors
        let availableTools = [];
        const toolToConnectorMap = new Map(); // Keep track of which connector owns which tool

        for (const [id, connector] of activeConnectors.entries()) {
            if (connector.status === 'connected') {
                try {
                    // Use official SDK method to list tools
                    const toolsResponse = await connector.client.listTools();

                    if (toolsResponse && toolsResponse.tools) {
                        toolsResponse.tools.forEach(tool => {
                            // Convert MCP tool schema to OpenAI/Grok format
                            availableTools.push({
                                type: "function",
                                function: {
                                    name: tool.name,
                                    description: tool.description || `Tool from ${connector.name}`,
                                    parameters: tool.inputSchema // Grok expects JSON schema
                                }
                            });
                            toolToConnectorMap.set(tool.name, connector);
                        });
                    }
                } catch (e) {
                    console.error("Error listing tools", e);
                }
            }
        }

        const requestBody = {
            // Changed from "grok-beta" to Groq's Llama 3.3 70B model identifier
            model: "llama-3.3-70b-versatile",
            messages,
            system: "You are the DMV Assistant. You have access to specialized MCP tools. If a tool is relevant to answer the user's query, you should call it.",
        };

        if (availableTools.length > 0) {
            requestBody.tools = availableTools;
            requestBody.tool_choice = "auto";
        }

        // Changed URL to Groq's OpenAI-compatible endpoint for Llama
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Uses your existing env variable, even if it's named GROK_API_KEY
                "Authorization": `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Grok API Error: ${errText}`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message;

        // Handle Tool Calling from Grok
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            // In a more complex architecture we'd loop this back to the LLM, 
            // but to keep this iteration manageable, we'll execute it and append the result.
            const toolCall = assistantMessage.tool_calls[0];
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

            const connector = toolToConnectorMap.get(functionName);

            if (connector) {
                try {
                    // Use official SDK method to call tool
                    const toolResult = await connector.client.callTool({
                        name: functionName,
                        arguments: functionArgs
                    });

                    // Append a notice about the tool execution to the assistant message
                    assistantMessage.content = (assistantMessage.content || "") +
                        `\n\n*(System Note: Executed tool '${functionName}' via MCP Server '${connector.name}'. Result:\n${JSON.stringify(toolResult.content)}*)`;

                } catch (e) {
                    assistantMessage.content = (assistantMessage.content || "") +
                        `\n\n*(System Note: Attempted to execute tool '${functionName}' but it failed: ${e.message})*`;
                }
            }
        }

        res.json(assistantMessage);

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`DMV Backend Server running on http://localhost:${PORT}`);
});
