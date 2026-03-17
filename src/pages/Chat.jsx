import { useState } from 'react';
import ConnectorsDropdown from '../components/ConnectorsDropdown';
import ChatInput from '../components/ChatInput';
import { MessageSquarePlus, Settings, LogOut, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
export default function Chat() {
    const navigate = useNavigate();
    const [threads, setThreads] = useState([
        {
            id: Date.now(),
            title: 'Current Session',
            messages: [
                {
                    id: 1,
                    role: 'assistant',
                    content: 'Hello Admin. I am connected to the DMV DMV_DB-connect system. How can I assist you with vehicle records, document extraction, or other internal tools today?',
                    files: []
                }
            ]
        }
    ]);
    const [activeThreadId, setActiveThreadId] = useState(threads[0].id);

    const activeThread = threads.find(t => t.id === activeThreadId) || threads[0];
    const handleSendMessage = async ({ text, files }) => {
        // 1. Read the actual contents of the attached files
        let fileContentText = "";
        const fileNames = [];

        for (const file of files) {
            fileNames.push(file.name);
            try {
                // Extracts text from txt, md, json, csv, etc.
                const fileText = await file.text();
                fileContentText += `\n\n--- Contents of uploaded file: ${file.name} ---\n${fileText}\n--- End of file ---\n`;
            } catch (err) {
                console.error("Could not read file text for:", file.name, err);
            }
        }

        // 2. Combine user text with the file content invisibly
        const fullPromptToSend = text + (fileContentText ? `\n\n[USER ATTACHED FILES]:${fileContentText}` : "");

        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: fullPromptToSend, // Sent to LLM with massive file text
            displayContent: text || "Uploaded files attached.", // Only display short text in UI
            files: fileNames
        };

        const activeT = threads.find(t => t.id === activeThreadId) || threads[0];
        const newMessagesContext = [...activeT.messages, userMessage];

        setThreads(prev => prev.map(t => {
            if (t.id === activeThreadId) {
                return {
                    ...t,
                    title: (t.messages.length === 1 && text) ? text.slice(0, 30) + '...' : t.title,
                    messages: newMessagesContext
                };
            }
            return t;
        }));

        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

            // Map over context, sending the FULL content (including file data) to the backend
            const contextToSend = newMessagesContext.map(m => ({
                role: m.role,
                content: m.content // this has the full text
            }));

            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: contextToSend })
            });

            if (!response.ok) {
                throw new Error("Backend response not ok");
            }
            const data = await response.json();

            setThreads(prev => prev.map(t => {
                if (t.id === activeThreadId) {
                    return {
                        ...t,
                        messages: [...t.messages, {
                            id: Date.now() + 1,
                            role: 'assistant',
                            content: data.content || JSON.stringify(data)
                        }]
                    };
                }
                return t;
            }));
        } catch (error) {
            console.error(error);
            setThreads(prev => prev.map(t => {
                if (t.id === activeThreadId) {
                    return {
                        ...t,
                        messages: [...t.messages, {
                            id: Date.now() + 1,
                            role: 'assistant',
                            content: "(System Error): Failed to reach DMV backend logic layer. Is server.js running?"
                        }]
                    };
                }
                return t;
            }));
        }
    };

    const handleNewChat = () => {
        const newThread = {
            id: Date.now(),
            title: 'New Session',
            messages: [
                {
                    id: 1,
                    role: 'assistant',
                    content: 'Hello again! What would you like to investigate now?',
                    files: []
                }
            ]
        };
        setThreads(prev => [newThread, ...prev]);
        setActiveThreadId(newThread.id);
    };

    const handleLogout = () => {
        navigate('/login');
    };

    return (
        <div className="chat-layout">
            {/* Sidebar */}
            <div className="sidebar">
                <div className="sidebar-header">
                    <div className="flex items-center gap-2 font-bold text-lg" style={{ color: 'var(--accent)' }}>
                        <ShieldAlert size={24} />
                        DMV Assist
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-2">
                    <button className="new-chat-btn" onClick={handleNewChat}>
                        <span>New Chat</span>
                        <MessageSquarePlus size={18} />
                    </button>

                    <div className="text-sm font-semibold mb-2 mt-6 text-gray-500 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                        Session History
                    </div>
                    <div className="flex flex-col gap-1">
                        {threads.map(thread => (
                            <button
                                key={thread.id}
                                onClick={() => setActiveThreadId(thread.id)}
                                className={`btn btn-ghost justify-start truncate ${thread.id === activeThreadId ? 'font-semibold text-blue-600 !bg-blue-50' : ''}`}
                                style={{ textAlign: 'left', padding: '0.5rem', backgroundColor: thread.id === activeThreadId ? 'var(--bg-primary)' : 'transparent', border: thread.id === activeThreadId ? '1px solid var(--border)' : '1px solid transparent' }}
                            >
                                {thread.title}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button className="btn btn-ghost w-full justify-start gap-2 mb-2" style={{ padding: '0.5rem' }}>
                        <Settings size={18} /> Settings
                    </button>
                    <button className="btn btn-ghost w-full justify-start gap-2" style={{ padding: '0.5rem' }} onClick={handleLogout}>
                        <LogOut size={18} /> Log out
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="main-content">
                {/* Header with Tool Dropdown */}
                <div className="chat-header">
                    <div className="font-semibold text-lg">System Dashboard</div>
                    <ConnectorsDropdown />
                </div>
                {/* Messages */}
                <div className="messages-container">
                    {activeThread.messages.map((msg) => (
                        <div key={msg.id} className="message">
                            <div className={`message-avatar ${msg.role}`}>
                                {msg.role === 'assistant' ? <ShieldAlert size={20} /> : 'A'}
                            </div>
                            <div className="message-content">
                                <div className="message-name">
                                    {msg.role === 'assistant' ? 'DMV Assistant' : 'Admin'}
                                </div>
                                <div className="text-gray-800 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                                    {msg.displayContent || msg.content}
                                </div>
                                {msg.files && msg.files.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {msg.files.map((file, i) => (
                                            <div key={i} className="bg-gray-100 px-3 py-1 rounded text-sm font-medium flex items-center gap-2" style={{ backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                                                📎 {file}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Input */}
                <ChatInput onSendMessage={handleSendMessage} />
            </div>
        </div>
    );
}
