import React from 'react';

/**
 * MessageRenderer
 * Renders assistant/user messages as clean, conversational prose.
 * Supports: bold (**text**), bullet lists (- item), numbered lists (1. item),
 * paragraph breaks. Strips/hides any accidental code blocks.
 */
export default function MessageRenderer({ content, role }) {
    if (!content) return null;

    // Strip any escaped code blocks that snuck through
    const sanitised = content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .trim();

    const lines = sanitised.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Skip blank lines but add paragraph spacing
        if (line.trim() === '') {
            i++;
            continue;
        }

        // Numbered list block
        if (/^\d+\.\s/.test(line.trim())) {
            const listItems = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
                listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
                i++;
            }
            elements.push(
                <ol key={`ol-${i}`} style={{
                    paddingLeft: '1.5rem',
                    margin: '0.5rem 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem'
                }}>
                    {listItems.map((item, idx) => (
                        <li key={idx} style={{ lineHeight: '1.6' }}>
                            <InlineText text={item} />
                        </li>
                    ))}
                </ol>
            );
            continue;
        }

        // Bullet list block (-, •, *)
        if (/^[-•*]\s/.test(line.trim())) {
            const listItems = [];
            while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
                listItems.push(lines[i].trim().replace(/^[-•*]\s/, ''));
                i++;
            }
            elements.push(
                <ul key={`ul-${i}`} style={{
                    paddingLeft: '1.25rem',
                    margin: '0.5rem 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    listStyleType: 'disc'
                }}>
                    {listItems.map((item, idx) => (
                        <li key={idx} style={{ lineHeight: '1.6', color: 'var(--text-primary)' }}>
                            <InlineText text={item} />
                        </li>
                    ))}
                </ul>
            );
            continue;
        }

        // Table-like lines (contains multiple | separators)
        if (line.includes('|') && (line.match(/\|/g) || []).length >= 2) {
            const tableLines = [];
            while (i < lines.length && lines[i].includes('|')) {
                if (!/^[\s|:-]+$/.test(lines[i])) { // skip separator rows like |---|---|
                    tableLines.push(lines[i]);
                }
                i++;
            }

            if (tableLines.length > 0) {
                const rows = tableLines.map(l =>
                    l.split('|').map(cell => cell.trim()).filter(Boolean)
                );
                const headers = rows[0];
                const bodyRows = rows.slice(1);

                elements.push(
                    <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
                        <table style={{
                            borderCollapse: 'collapse',
                            width: '100%',
                            fontSize: '0.9rem'
                        }}>
                            <thead>
                                <tr>
                                    {headers.map((h, idx) => (
                                        <th key={idx} style={{
                                            padding: '0.5rem 0.75rem',
                                            textAlign: 'left',
                                            borderBottom: '2px solid var(--border)',
                                            fontWeight: '600',
                                            color: 'var(--text-secondary)',
                                            whiteSpace: 'nowrap',
                                            backgroundColor: 'var(--bg-secondary)'
                                        }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {bodyRows.map((row, rIdx) => (
                                    <tr key={rIdx} style={{
                                        borderBottom: '1px solid var(--border)',
                                        backgroundColor: rIdx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)'
                                    }}>
                                        {row.map((cell, cIdx) => (
                                            <td key={cIdx} style={{
                                                padding: '0.5rem 0.75rem',
                                                color: 'var(--text-primary)'
                                            }}>
                                                <InlineText text={cell} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
            continue;
        }

        // Regular paragraph line
        elements.push(
            <p key={`p-${i}`} style={{
                margin: '0.35rem 0',
                lineHeight: '1.7',
                color: 'var(--text-primary)'
            }}>
                <InlineText text={line} />
            </p>
        );
        i++;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {elements}
        </div>
    );
}

/**
 * Renders inline text with **bold** and *italic* support.
 */
function InlineText({ text }) {
    if (!text) return null;

    // Split on **bold** and *italic*
    const parts = [];
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let last = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
            parts.push({ type: 'text', value: text.slice(last, match.index) });
        }
        const raw = match[0];
        if (raw.startsWith('**')) {
            parts.push({ type: 'bold', value: raw.slice(2, -2) });
        } else {
            parts.push({ type: 'italic', value: raw.slice(1, -1) });
        }
        last = match.index + raw.length;
    }

    if (last < text.length) {
        parts.push({ type: 'text', value: text.slice(last) });
    }

    if (parts.length === 0) return <>{text}</>;

    return (
        <>
            {parts.map((part, idx) => {
                if (part.type === 'bold') return <strong key={idx}>{part.value}</strong>;
                if (part.type === 'italic') return <em key={idx}>{part.value}</em>;
                return <span key={idx}>{part.value}</span>;
            })}
        </>
    );
}
