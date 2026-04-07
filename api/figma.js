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
    const baseUrl = `https://api.figma.com/v1/files/${fileKey}`;
    const url = nodeId ? `${baseUrl}/nodes?ids=${encodeURIComponent(nodeId)}` : baseUrl;

    const response = await fetch(url, {
        headers: { 'X-Figma-Token': apiKey },
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Figma API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
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
    const doc = figmaData.document || figmaData;
    const pages = doc.children || [];

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

    // Simplified page structure
    context += '\n### Page Structure\n';
    for (const page of pages.slice(0, 3)) { // Max 3 pages
        context += `\n#### Page: ${page.name}\n`;
        if (page.children) {
            for (const frame of page.children.slice(0, 5)) { // Max 5 top-level frames
                const simplified = simplifyNode(frame);
                if (simplified) {
                    context += '```json\n' + JSON.stringify(simplified, null, 2).slice(0, 3000) + '\n```\n';
                }
            }
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
