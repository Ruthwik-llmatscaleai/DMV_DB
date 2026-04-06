import React, { Suspense, useState } from 'react';
import { Copy, Check, Download, Maximize2, Minimize2, Code, Eye } from 'lucide-react';

// Lazy-load Sandpack so it only loads when code preview is needed (~250KB)
const SandpackLazy = React.lazy(() =>
    import('@codesandbox/sandpack-react').then(mod => ({ default: mod.Sandpack }))
);

/**
 * SandpackPreview
 * Renders a live, interactive website preview from LLM-generated code files.
 * Supports React and vanilla HTML/CSS/JS templates.
 */
export default function SandpackPreview({ files, template = 'react', onCodeParsed }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeView, setActiveView] = useState('preview'); // 'preview' | 'code'

    if (!files || Object.keys(files).length === 0) return null;

    // Prepare files for Sandpack format
    const sandpackFiles = {};
    for (const [name, code] of Object.entries(files)) {
        const key = name.startsWith('/') ? name : `/${name}`;
        sandpackFiles[key] = { code };
    }

    // Ensure App.jsx exists for React template
    if (template === 'react' && !sandpackFiles['/App.jsx'] && !sandpackFiles['/App.js']) {
        // Try to use index.jsx or index.js as entry
        if (sandpackFiles['/index.jsx']) {
            sandpackFiles['/App.jsx'] = sandpackFiles['/index.jsx'];
            delete sandpackFiles['/index.jsx'];
        }
    }

    const handleCopyAll = async () => {
        try {
            const allCode = Object.entries(files)
                .map(([name, code]) => `// ── ${name} ──\n${code}`)
                .join('\n\n');
            await navigator.clipboard.writeText(allCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    const handleDownload = () => {
        // Create a simple downloadable HTML with all files concatenated
        const allCode = Object.entries(files)
            .map(([name, code]) => `// ══════ ${name} ══════\n${code}`)
            .join('\n\n');

        const blob = new Blob([allCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated-project.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const fileCount = Object.keys(files).length;
    const containerHeight = expanded ? '600px' : '420px';

    return (
        <div className="sandpack-preview-container" style={{ height: expanded ? 'auto' : undefined }}>
            {/* Header */}
            <div className="sandpack-header">
                <div className="sandpack-header-left">
                    <span className="sandpack-status-dot" />
                    <span className="sandpack-title">Live Preview</span>
                    <span className="sandpack-file-count">{fileCount} file{fileCount > 1 ? 's' : ''}</span>
                </div>
                <div className="sandpack-actions">
                    <button
                        className="sandpack-action-btn"
                        onClick={() => setActiveView(activeView === 'preview' ? 'code' : 'preview')}
                        title={activeView === 'preview' ? 'Show code' : 'Show preview'}
                    >
                        {activeView === 'preview' ? <Code size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                        className="sandpack-action-btn"
                        onClick={handleCopyAll}
                        title="Copy all code"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button
                        className="sandpack-action-btn"
                        onClick={handleDownload}
                        title="Download project"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        className="sandpack-action-btn"
                        onClick={() => setExpanded(!expanded)}
                        title={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
            </div>

            {/* Sandpack Renderer */}
            <div style={{ height: containerHeight, overflow: 'hidden', borderRadius: '0 0 12px 12px' }}>
                <Suspense fallback={
                    <div className="sandpack-loading">
                        <div className="sandpack-loading-spinner" />
                        <span>Loading preview engine...</span>
                    </div>
                }>
                    <SandpackLazy
                        template={template === 'vanilla' ? 'vanilla' : 'react'}
                        files={sandpackFiles}
                        theme="dark"
                        options={{
                            showNavigator: true,
                            showTabs: true,
                            showLineNumbers: true,
                            editorHeight: parseInt(containerHeight),
                            activeFile: Object.keys(sandpackFiles)[0],
                            layout: activeView === 'code' ? 'console' : 'preview',
                        }}
                    />
                </Suspense>
            </div>
        </div>
    );
}
