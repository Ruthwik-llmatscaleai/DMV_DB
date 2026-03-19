import { useState, useRef, useEffect, useCallback } from 'react';
import ConnectorsDropdown from '../components/ConnectorsDropdown';
import ChatInput from '../components/ChatInput';
import MessageRenderer from '../components/MessageRenderer';
import {
    MessageSquarePlus, LogOut, ShieldCheck,
    Trash2, ChevronDown, Copy, Check, RefreshCw, Database
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WELCOME_MESSAGE = {
    id: 1,
    role: 'assistant',
    content: "Hello! I'm Atlas, your DMV administrative assistant. I can help you look up vehicle records, check registration information, run data summaries, and much more.\n\nConnect a database via the **Connectors** button above, then ask me anything about your data.",
    timestamp: Date.now(),
};

// ─── Tiny helpers ────────────────────────────────────────────────────────────
function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };
    return (
        <button
            onClick={handleCopy}
            title="Copy message"
            style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: copied ? 'var(--success)' : 'var(--text-muted)',
                padding: '2px 4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                transition: 'color 0.2s',
                marginTop: '0.5rem',
            }}
        >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

function TypingIndicator() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0' }}>
            {[0, 1, 2].map(i => (
                <span key={i} style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--text-muted)',
                    display: 'inline-block',
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
            ))}
            <style>{`
                @keyframes bounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-5px); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

// ─── Empty state shown for brand-new threads (no messages yet) ───────────────
function EmptyState({ onQuickPrompt }) {
    const prompts = [
        'What datasets are available?',
        'Show me a summary of vehicle registrations',
        'How many records are in the database?',
        'List the available tables',
    ];
    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1rem',
            gap: '2rem',
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: '64px', height: '64px',
                    borderRadius: '16px',
                    backgroundColor: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 1rem',
                    opacity: 0.9,
                }}>
                    <Database size={32} color="white" />
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                    Ask Atlas anything
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '360px' }}>
                    Connect a database connector, then ask a question to explore your data.
                </p>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                maxWidth: '480px',
                width: '100%',
            }}>
                {prompts.map((p, i) => (
                    <button
                        key={i}
                        onClick={() => onQuickPrompt(p)}
                        style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-secondary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.85rem',
                            color: 'var(--text-primary)',
                            lineHeight: '1.4',
                            transition: 'border-color 0.15s, background-color 0.15s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--accent)';
                            e.currentTarget.style.backgroundColor = 'white';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                        }}
                    >
                        {p}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Main Chat component ─────────────────────────────────────────────────────
export default function Chat() {
    const navigate = useNavigate();
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);

    const THREADS_KEY = 'dmv_chat_threads';
    const loadSavedThreads = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(THREADS_KEY));
            if (saved && saved.length > 0) return saved;
        } catch { /* ignore */ }
        return [{ id: Date.now(), title: 'New Session', messages: [WELCOME_MESSAGE] }];
    };

    const [threads, setThreads] = useState(loadSavedThreads);
    const [activeThreadId, setActiveThreadId] = useState(() => {
        const saved = loadSavedThreads();
        return saved[0]?.id || Date.now();
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [failedMessageId, setFailedMessageId] = useState(null);
    const [lastUserPayload, setLastUserPayload] = useState(null);

    // Save threads to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
        } catch { /* quota exceeded — ignore */ }
    }, [threads]);

    const activeThread = threads.find(t => t.id === activeThreadId) || threads[0];

    // Scroll to bottom
    const scrollToBottom = useCallback((behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [activeThread.messages, isLoading, scrollToBottom]);

    // Show/hide scroll-to-bottom button
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const onScroll = () => {
            const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            setShowScrollBtn(distFromBottom > 200);
        };
        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll);
    }, []);

    // Core send logic, extracted so retry can reuse it
    const sendMessage = useCallback(async ({ text }) => {
        if (!text.trim()) return;

        const fullPrompt = text;
        const now = Date.now();
        const userMessage = {
            id: now,
            role: 'user',
            content: fullPrompt,
            displayContent: text,
            timestamp: now,
        };

        const previousMessages = activeThread.messages;
        const isFirstUserMessage = previousMessages.filter(m => m.role === 'user').length === 0;
        const newTitle = isFirstUserMessage && text
            ? text.slice(0, 40) + (text.length > 40 ? '…' : '')
            : activeThread.title;

        setLastUserPayload({ text });
        setFailedMessageId(null);

        setThreads(prev => prev.map(t =>
            t.id === activeThreadId
                ? { ...t, title: newTitle, messages: [...t.messages, userMessage] }
                : t
        ));
        setIsLoading(true);

        try {
            const API_URL = import.meta.env.VITE_API_URL || '/api';
            const contextToSend = [...previousMessages, userMessage].map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: contextToSend }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const assistantMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: data.content || "I received a response but couldn't read it. Please try again.",
                timestamp: Date.now() + 1,
            };

            setThreads(prev => prev.map(t =>
                t.id === activeThreadId
                    ? { ...t, messages: [...t.messages, assistantMessage] }
                    : t
            ));
        } catch (error) {
            console.error('Chat error:', error);
            const errId = Date.now() + 2;
            setFailedMessageId(errId);
            setThreads(prev => prev.map(t =>
                t.id === activeThreadId
                    ? {
                        ...t,
                        messages: [...t.messages, {
                            id: errId,
                            role: 'assistant',
                            content: "I'm having trouble connecting to the backend. Please make sure the server is running and try again.",
                            isError: true,
                            timestamp: Date.now() + 2,
                        }],
                    }
                    : t
            ));
        } finally {
            setIsLoading(false);
        }
    }, [activeThread, activeThreadId]);

    const handleSendMessage = (payload) => sendMessage(payload);

    const handleRetry = () => {
        if (!lastUserPayload) return;
        // Remove the last error message before retrying
        setThreads(prev => prev.map(t =>
            t.id === activeThreadId
                ? { ...t, messages: t.messages.filter(m => m.id !== failedMessageId) }
                : t
        ));
        setFailedMessageId(null);
        sendMessage(lastUserPayload);
    };

    const handleQuickPrompt = (text) => {
        sendMessage({ text });
    };

    const handleNewChat = () => {
        const newThread = {
            id: Date.now(),
            title: 'New Session',
            messages: [{ ...WELCOME_MESSAGE, id: Date.now() }],
        };
        setThreads(prev => [newThread, ...prev]);
        setActiveThreadId(newThread.id);
        setFailedMessageId(null);
    };

    const handleDeleteThread = (threadId, e) => {
        e.stopPropagation();
        setThreads(prev => {
            const filtered = prev.filter(t => t.id !== threadId);
            if (filtered.length === 0) {
                const fresh = { id: Date.now(), title: 'New Session', messages: [{ ...WELCOME_MESSAGE, id: Date.now() }] };
                setActiveThreadId(fresh.id);
                return [fresh];
            }
            if (threadId === activeThreadId) {
                setActiveThreadId(filtered[0].id);
            }
            return filtered;
        });
    };

    // Only show quick prompts on a truly fresh thread (just welcome msg)
    const showEmptyState = activeThread.messages.length === 1 &&
        activeThread.messages[0].role === 'assistant';

    return (
        <div className="chat-layout">
            {/* ── Sidebar ── */}
            <div className="sidebar">
                <div className="sidebar-header">
                    <div className="flex items-center gap-2 font-bold text-lg" style={{ color: 'var(--accent)' }}>
                        <ShieldCheck size={22} />
                        <span>DMV Atlas</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-2">
                    <button className="new-chat-btn" onClick={handleNewChat}>
                        <span>New Conversation</span>
                        <MessageSquarePlus size={18} />
                    </button>

                    <div style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        marginBottom: '0.5rem',
                        marginTop: '1.5rem',
                    }}>
                        Recent
                    </div>

                    <div className="flex flex-col gap-1">
                        {threads.map(thread => (
                            <div
                                key={thread.id}
                                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                            >
                                <button
                                    onClick={() => setActiveThreadId(thread.id)}
                                    style={{
                                        flex: 1,
                                        textAlign: 'left',
                                        padding: '0.5rem 2rem 0.5rem 0.75rem',
                                        fontSize: '0.875rem',
                                        fontWeight: thread.id === activeThreadId ? 600 : 400,
                                        backgroundColor: thread.id === activeThreadId ? 'var(--bg-primary)' : 'transparent',
                                        border: thread.id === activeThreadId ? '1px solid var(--border)' : '1px solid transparent',
                                        borderRadius: 'var(--radius-md)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        color: thread.id === activeThreadId ? 'var(--accent)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        background: thread.id === activeThreadId ? 'var(--bg-primary)' : 'transparent',
                                        width: '100%',
                                    }}
                                >
                                    {thread.title}
                                </button>
                                {/* Delete button — only shows on hover via CSS trick */}
                                <button
                                    onClick={(e) => handleDeleteThread(thread.id, e)}
                                    title="Delete conversation"
                                    style={{
                                        position: 'absolute',
                                        right: '6px',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-muted)',
                                        padding: '3px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        opacity: thread.id === activeThreadId ? 1 : 0,
                                        transition: 'opacity 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.opacity = '1'; }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.color = 'var(--text-muted)';
                                        e.currentTarget.style.opacity = thread.id === activeThreadId ? '1' : '0';
                                    }}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button
                        className="btn btn-ghost w-full justify-start gap-2"
                        style={{ padding: '0.5rem', fontSize: '0.875rem' }}
                        onClick={() => navigate('/login')}
                    >
                        <LogOut size={16} /> Log out
                    </button>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="main-content">
                <div className="chat-header">
                    <div style={{
                        fontWeight: 600,
                        fontSize: '1rem',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '400px',
                    }}>
                        {activeThread.title}
                    </div>
                    <ConnectorsDropdown />
                </div>

                {/* Messages or empty state */}
                {showEmptyState ? (
                    <EmptyState onQuickPrompt={handleQuickPrompt} />
                ) : (
                    <div
                        ref={messagesContainerRef}
                        className="messages-container"
                        style={{ position: 'relative' }}
                    >
                        {activeThread.messages.map((msg) => (
                            <div key={msg.id} className="message">
                                <div className={`message-avatar ${msg.role}`}>
                                    {msg.role === 'assistant'
                                        ? <ShieldCheck size={18} />
                                        : <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>U</span>
                                    }
                                </div>
                                <div className="message-content">
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        marginBottom: '0.4rem',
                                    }}>
                                        <span style={{
                                            fontSize: '0.875rem',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 600,
                                        }}>
                                            {msg.role === 'assistant' ? 'Atlas' : 'You'}
                                        </span>
                                        {msg.timestamp && (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {formatTime(msg.timestamp)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Error banner */}
                                    {msg.isError && (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.5rem 0.75rem',
                                            backgroundColor: 'rgba(239,68,68,0.08)',
                                            border: '1px solid rgba(239,68,68,0.2)',
                                            borderRadius: '8px',
                                            marginBottom: '0.5rem',
                                        }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--error)' }}>
                                                Connection error.
                                            </span>
                                            <button
                                                onClick={handleRetry}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                    fontSize: '0.8rem', color: 'var(--accent)',
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                <RefreshCw size={12} /> Retry
                                            </button>
                                        </div>
                                    )}

                                    <MessageRenderer
                                        content={msg.displayContent || msg.content}
                                        role={msg.role}
                                    />

                                    {/* File chips */}
                                    {msg.files && msg.files.length > 0 && (
                                        <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            {msg.files.map((file, i) => (
                                                <span key={i} style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                    backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                                                    padding: '0.2rem 0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)',
                                                }}>
                                                    📎 {file}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Copy button on assistant messages */}
                                    {msg.role === 'assistant' && !msg.isError && (
                                        <CopyButton text={msg.displayContent || msg.content} />
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="message">
                                <div className="message-avatar assistant">
                                    <ShieldCheck size={18} />
                                </div>
                                <div className="message-content">
                                    <div style={{
                                        fontSize: '0.875rem', color: 'var(--text-secondary)',
                                        fontWeight: 600, marginBottom: '0.4rem',
                                    }}>
                                        Atlas
                                    </div>
                                    <TypingIndicator />
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Scroll-to-bottom floating button */}
                {showScrollBtn && (
                    <button
                        onClick={() => scrollToBottom()}
                        style={{
                            position: 'absolute',
                            bottom: '130px',
                            right: '2rem',
                            width: '36px', height: '36px',
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow-md)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-secondary)',
                            zIndex: 20,
                            transition: 'box-shadow 0.2s',
                        }}
                        title="Scroll to bottom"
                    >
                        <ChevronDown size={18} />
                    </button>
                )}

                <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
            </div>
        </div>
    );
}