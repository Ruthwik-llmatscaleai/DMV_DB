/**
 * Figma API Integration
 * Fetches design data from Figma files and converts it into
 * AI-friendly context for code generation.
 */

/**
 * Extracts a Figma file key from a URL.
 * Supports: figma.com/file/KEY/..., figma.com/design/KEY/..., or raw key
 */
export function extractFigmaFileKey(input) {
    if (!input) return null;
    // Match figma.com/file/KEY or figma.com/design/KEY
    const urlMatch = input.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    // Match raw key (alphanumeric, 22+ chars)
    if (/^[a-zA-Z0-9]{10,}$/.test(input.trim())) return input.trim();
    return null;
}

/**
 * Extracts a specific node ID from a Figma URL (e.g., ?node-id=1:2)
 */
export function extractNodeId(input) {
    if (!input) return null;
    const match = input.match(/node-id=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
    return null;
}

/**
 * Fetches a Figma file's design data and returns a simplified summary.
 */
export async function fetchFigmaFile(fileKey, apiKey, nodeId) {
    const headers = { 'X-Figma-Token': apiKey };
    const baseUrl = `https://api.figma.com/v1/files/${fileKey}`;

    // If node-id specified, try fetching that specific node first
    if (nodeId) {
        // Figma API uses : separator, URLs use -
        const normalizedId = nodeId.replace('-', ':');
        const nodeUrl = `${baseUrl}/nodes?ids=${encodeURIComponent(normalizedId)}&depth=4`;
        const nodeRes = await fetch(nodeUrl, { headers });

        if (nodeRes.ok) {
            const nodeData = await nodeRes.json();
            // Check if the node has useful content (children)
            const firstNode = Object.values(nodeData.nodes || {})[0];
            if (firstNode?.document?.children?.length > 0) {
                return nodeData;
            }
            // Node is a leaf — fall through to fetch full file
            console.log(`[Figma] Node ${nodeId} is a leaf element, fetching full file instead`);
        }
    }

    // Fetch full file with limited depth for performance
    const url = `${baseUrl}?depth=3`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Figma API error: ${response.status}`);
    }

    return await response.json();
}

/**
 * Fetches styles (colors, text styles, effects) from a Figma file.
 */
export async function fetchFigmaStyles(fileKey, apiKey) {
    const response = await fetch(`https://api.figma.com/v1/files/${fileKey}/styles`, {
        headers: { 'X-Figma-Token': apiKey },
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.meta?.styles || [];
}

/**
 * Simplifies a Figma node tree into an AI-friendly structure.
 * Extracts layout, colors, typography, and component hierarchy.
 */
function simplifyNode(node, depth = 0) {
    if (depth > 6) return null; // Limit depth to avoid huge outputs

    const simplified = {
        name: node.name,
        type: node.type,
    };

    // Layout
    if (node.absoluteBoundingBox) {
        simplified.width = Math.round(node.absoluteBoundingBox.width);
        simplified.height = Math.round(node.absoluteBoundingBox.height);
    }

    if (node.layoutMode) {
        simplified.layout = node.layoutMode; // HORIZONTAL, VERTICAL
        simplified.gap = node.itemSpacing;
        simplified.padding = {
            top: node.paddingTop,
            right: node.paddingRight,
            bottom: node.paddingBottom,
            left: node.paddingLeft,
        };
    }

    // Colors
    if (node.fills?.length > 0) {
        const fill = node.fills[0];
        if (fill.type === 'SOLID' && fill.color) {
            const { r, g, b } = fill.color;
            simplified.backgroundColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        }
        if (fill.type === 'GRADIENT_LINEAR') {
            simplified.background = 'linear-gradient';
        }
    }

    // Typography
    if (node.type === 'TEXT') {
        simplified.text = node.characters;
        if (node.style) {
            simplified.fontSize = node.style.fontSize;
            simplified.fontFamily = node.style.fontFamily;
            simplified.fontWeight = node.style.fontWeight;
            simplified.lineHeight = node.style.lineHeightPx;
            simplified.letterSpacing = node.style.letterSpacing;
            simplified.textAlign = node.style.textAlignHorizontal;
        }
    }

    // Border radius
    if (node.cornerRadius) {
        simplified.borderRadius = node.cornerRadius;
    }

    // Effects (shadows, blur)
    if (node.effects?.length > 0) {
        simplified.effects = node.effects.map(e => ({
            type: e.type,
            radius: e.radius,
            offset: e.offset,
        }));
    }

    // Children
    if (node.children?.length > 0) {
        simplified.children = node.children
            .map(child => simplifyNode(child, depth + 1))
            .filter(Boolean);
    }

    return simplified;
}

/**
 * Converts raw Figma file data into a concise design context string
 * suitable for injecting into an LLM prompt.
 */
export function figmaToContext(figmaData, styles) {
    let context = '## Figma Design Context\n\n';

    // File info
    if (figmaData.name) {
        context += `**File:** ${figmaData.name}\n`;
    }

    // Styles summary
    if (styles?.length > 0) {
        context += '\n### Design Tokens\n';
        const colorStyles = styles.filter(s => s.style_type === 'FILL');
        const textStyles = styles.filter(s => s.style_type === 'TEXT');

        if (colorStyles.length > 0) {
            context += `**Colors:** ${colorStyles.map(s => s.name).join(', ')}\n`;
        }
        if (textStyles.length > 0) {
            context += `**Text Styles:** ${textStyles.map(s => s.name).join(', ')}\n`;
        }
    }

    // Handle both full file response (has .document) and nodes response (has .nodes)
    let nodesToProcess = [];

    if (figmaData.nodes) {
        // Nodes API response: { nodes: { "39:1427": { document: {...} } } }
        for (const [nodeId, nodeData] of Object.entries(figmaData.nodes)) {
            const doc = nodeData.document;
            if (doc) {
                if (doc.children?.length > 0) {
                    // It's a container (frame, page, etc.) — process its children
                    nodesToProcess.push(...doc.children.slice(0, 10));
                } else {
                    // It's a leaf node — process it directly
                    nodesToProcess.push(doc);
                }
            }
        }
    } else if (figmaData.document) {
        // Full file response
        const pages = figmaData.document.children || [];
        for (const page of pages.slice(0, 3)) {
            if (page.children) {
                nodesToProcess.push(...page.children.slice(0, 5));
            }
        }
    }

    // Simplified structure
    context += '\n### Design Structure\n';
    if (nodesToProcess.length === 0) {
        context += '\nNo detailed structure available for this selection.\n';
    }
    for (const node of nodesToProcess) {
        const simplified = simplifyNode(node);
        if (simplified) {
            context += `\n#### ${node.name || 'Element'}\n`;
            context += '```json\n' + JSON.stringify(simplified, null, 2).slice(0, 3000) + '\n```\n';
        }
    }

    // Truncate if too long
    if (context.length > 8000) {
        context = context.slice(0, 8000) + '\n\n[... design context truncated for context window ...]';
    }

    return context;
}

/**
 * Detects if a message contains a Figma URL or reference.
 */
export function isFigmaRequest(text) {
    return /figma\.com\/(?:file|design)\/[a-zA-Z0-9]/.test(text) ||
           /\bfigma\b.*\b(convert|code|build|create|implement|design)\b/i.test(text) ||
           /\b(convert|code|build|create|implement)\b.*\bfigma\b/i.test(text);
}
