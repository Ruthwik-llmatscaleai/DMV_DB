import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import cors from 'cors';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(cors());

// Configure the Salesforce MCP Local command
// Using npx -y should be non-interactive.
const SF_MCP_COMMAND = 'npx';
const SF_MCP_ARGS = [
    '-y',
    '@salesforce/mcp@latest',
    '--orgs',
    'prodOrg',
    '--toolsets',
    'orgs,metadata,data,users'
];

async function startBridge() {
    console.log('--- Salesforce MCP HTTP Bridge (v2) ---');
    console.log(`Port: 8002`);

    // 1. Create the Proxy Server
    const server = new Server({
        name: "Salesforce Proxy (Local)",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {},
            resources: {}
        },
    });

    let upstreamClient = null;

    async function ensureUpstream() {
        if (upstreamClient) return upstreamClient;
        
        console.log(`[DEBUG] Connecting to upstream: ${SF_MCP_COMMAND} ${SF_MCP_ARGS.join(' ')}`);
        const stdioTransport = new StdioClientTransport({
            command: SF_MCP_COMMAND,
            args: SF_MCP_ARGS,
            // Log child stderr to bridge stdout
            stderr: "inherit" 
        });

        const client = new Client({
            name: "sf-bridge-client",
            version: "1.0.0",
        }, {
            capabilities: {},
        });

        try {
            await client.connect(stdioTransport);
            console.log('[DEBUG] Connected to Salesforce CLI MCP (stdio)');
            upstreamClient = client;
            return client;
        } catch (err) {
            console.error('[ERROR] Failed to connect to SF DX MCP:', err);
            throw err;
        }
    }

    // 2. Proxy Tools
    server.setRequestHandler(
        ListToolsRequestSchema,
        async () => {
            const client = await ensureUpstream();
            return await client.listTools();
        }
    );

    server.setRequestHandler(
        CallToolRequestSchema,
        async (request) => {
            const client = await ensureUpstream();
            return await client.callTool(request.params.name, request.params.arguments);
        }
    );

    // 3. Set up SSE Transport (supports multiple concurrent clients)
    const sseTransports = new Map();

    app.get('/mcp', async (req, res) => {
        console.log('[DEBUG] New SSE connection at /mcp');
        const transport = new SSEServerTransport('/message', res);
        sseTransports.set(transport.sessionId, transport);

        res.on('close', () => {
            sseTransports.delete(transport.sessionId);
            console.log(`[DEBUG] SSE session ${transport.sessionId} closed`);
        });

        await server.connect(transport);
        console.log(`[DEBUG] Server bound to SSE transport (session: ${transport.sessionId})`);
    });

    app.post('/message', async (req, res) => {
        const sessionId = req.query.sessionId;
        const transport = sseTransports.get(sessionId);
        if (transport) {
            await transport.handlePostMessage(req, res);
        } else {
            res.status(404).send('No active SSE session for this ID');
        }
    });

    const PORT = process.env.PORT || 8002;
    app.listen(PORT, () => {
        console.log(`Salesforce MCP HTTP Bridge listening on port ${PORT}`);
        console.log(`Expose this using: zrok share public http://localhost:${PORT}`);
    });
}

startBridge().catch(err => {
    console.error('Failed to start Salesforce MCP Bridge:', err);
    process.exit(1);
});
