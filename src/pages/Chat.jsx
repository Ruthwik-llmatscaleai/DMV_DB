import { useState, useRef, useEffect } from 'react';
import ConnectorsDropdown from '../components/ConnectorsDropdown';
import ChatInput from '../components/ChatInput';
import MessageRenderer from '../components/MessageRenderer';
import { MessageSquarePlus, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WELCOME_MESSAGE = {
    id: 1,
    role: 'assistant',
    content: "Hello! I'm Atlas, your DMV administrative assistant. I can help you look up vehicle records, check registration information, run data summaries, and much more. What would you like to know today?"
};

export default function Chat() {
    const navigate = useNavigate();
    const messagesEndRef = useRef(null);

    const [threads, setThreads] = useState([
        { id: Date.now(), title: 'New Session', messages: [WELCOME_MESSAGE] }
    ]);
    const [activeThreadId, setActiveThreadId] = useState(threads[0].id);
    const [isLoading, setIsLoading] = useState(false);

    const activeThread = threads.find(t => t.id === activeThreadId) || threads[0];

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeThread.messages, isLoading]);

    const handleSendMessage = async ({ text, files }) => {
        if (!text.trim() && files.length === 0) return;

        // Read file contents invisibly for the LLM
        let fileContentText = '';
        const fileNames = [];

        for (const file of files) {
            fileNames.push(file.name);
            try {
                const fileText = await file.text();
                fileContentText += `\n\n--- Uploaded file: ${file.name} ---\n${fileText}\n--- End of file ---\n`;
            } catch (err) {
                console.error('Could not read file:', file.name, err);
            }
        }

        const fullPrompt = text + (fileContentText ? `\n\n[ATTACHED FILES]:${fileContentText}` : '');

        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: fullPrompt,           // full content sent to LLM
            displayContent: text || 'Uploaded files.',  // clean display
            files: fileNames
        };

        // Determine thread title from first real user message
        const isFirstUserMessage = activeThread.messages.filter(m => m.role === 'user').length === 0;
        const newTitle = isFirstUserMessage && text ? text.slice(0, 40) + (text.length > 40 ? '…' : '') : activeThread.title;

        setThreads(prev => prev.map(t =>
            t.id === activeThreadId
                ? { ...t, title: newTitle, messages: [...t.messages, userMessage] }
                : t
        ));
        setIsLoading(true);

        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

            // Build context: use full content for LLM, keep role only
            const updatedMessages = [...activeThread.messages, userMessage];
            const contextToSend = updatedMessages.map(m => ({
                role: m.role,
                content: m.content
            }));

            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: contextToSend })
            });

            if (!response.ok) throw new Error('Backend response not ok');

            const data = await response.json();
            const assistantMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: data.content || "I received a response but couldn't read it. Please try again."
            };

            setThreads(prev => prev.map(t =>
                t.id === activeThreadId
                    ? { ...t, messages: [...t.messages, userMessage, assistantMessage] }
                    : t
            ));
        } catch (error) {
            console.error('Chat error:', error);
            setThreads(prev => prev.map(t =>
                t.id === activeThreadId
                    ? {
                        ...t,
                        messages: [...t.messages, userMessage, {
                            id: Date.now() + 1,
                            role: 'assistant',
                            content: "I'm having trouble connecting to the backend. Please make sure the server is running and try again."
                        }]
                    }
                    : t
            ));
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewChat = () => {
        const newThread = {
            id: Date.now(),
            title: 'New Session',
            messages: [{ ...WELCOME_MESSAGE, id: Date.now() }]
        };
        setThreads(prev => [newThread, ...prev]);
        setActiveThreadId(newThread.id);
    };

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
                        marginTop: '1.5rem'
                    }}>
                        Recent
                    </div>

                    <div className="flex flex-col gap-1">
                        {threads.map(thread => (
                            <button
                                key={thread.id}
                                onClick={() => setActiveThreadId(thread.id)}
                                className="btn btn-ghost justify-start"
                                style={{
                                    textAlign: 'left',
                                    padding: '0.5rem 0.75rem',
                                    fontSize: '0.875rem',
                                    fontWeight: thread.id === activeThreadId ? 600 : 400,
                                    backgroundColor: thread.id === activeThreadId ? 'var(--bg-primary)' : 'transparent',
                                    border: thread.id === activeThreadId ? '1px solid var(--border)' : '1px solid transparent',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: thread.id === activeThreadId ? 'var(--accent)' : 'var(--text-secondary)'
                                }}
                            >
                                {thread.title}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button className="btn btn-ghost w-full justify-start gap-2 mb-1" style={{ padding: '0.5rem', fontSize: '0.875rem' }}>
                        <Settings size={16} /> Settings
                    </button>
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
                {/* Header */}
                <div className="chat-header">
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {activeThread.title}
                    </div>
                    <ConnectorsDropdown />
                </div>

                {/* Messages */}
                <div className="messages-container">
                    {activeThread.messages.map((msg) => (
                        <div key={msg.id} className="message">
                            {/* Avatar */}
                            <div className={`message-avatar ${msg.role}`}>
                                {msg.role === 'assistant'
                                    ? <ShieldCheck size={18} />
                                    : <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>A</span>
                                }
                            </div>

                            {/* Content */}
                            <div className="message-content">
                                <div className="message-name" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>
                                    {msg.role === 'assistant' ? 'Atlas' : 'You'}
                                </div>

                                <MessageRenderer
                                    content={msg.displayContent || msg.content}
                                    role={msg.role}
                                />

                                {/* Attached file chips */}
                                {msg.files && msg.files.length > 0 && (
                                    <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {msg.files.map((file, i) => (
                                            <span key={i} style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                backgroundColor: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '0.2rem 0.6rem',
                                                fontSize: '0.8rem',
                                                color: 'var(--text-secondary)'
                                            }}>
                                                📎 {file}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isLoading && (
                        <div className="message">
                            <div className="message-avatar assistant">
                                <ShieldCheck size={18} />
                            </div>
                            <div className="message-content">
                                <div className="message-name" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>
                                    Atlas
                                </div>
                                <TypingIndicator />
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
            </div>
        </div>
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
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`
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