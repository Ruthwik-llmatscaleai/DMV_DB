import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Server, Power, Box, Link as LinkIcon, Terminal, Trash2, Edit2, X, Check, RefreshCw } from 'lucide-react';

export default function ConnectorsDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [isAddingMode, setIsAddingMode] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [connectType, setConnectType] = useState('stdio');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    const [newConnectorName, setNewConnectorName] = useState('');
    const [newConnectorCommand, setNewConnectorCommand] = useState('');
    const [newConnectorArgs, setNewConnectorArgs] = useState('');
    const [newConnectorUrl, setNewConnectorUrl] = useState('');

    const [connectors, setConnectors] = useState([]);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

    const fetchConnectors = async () => {
        try {
            const res = await fetch(`${API_URL}/connectors`);
            const data = await res.json();
            setConnectors(data);
        } catch (e) { console.error("Failed to fetch connectors:", e); }
    };

    useEffect(() => {
        fetchConnectors();
        const interval = setInterval(fetchConnectors, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleStatus = async (id, currentStatus) => {
        // Only allow delete for now to simplify
        if (confirm("Are you sure you want to remove this connector?")) {
            await fetch(`${API_URL}/connectors/${id}`, { method: 'DELETE' });
            await fetchConnectors();
        }
    };

    const handleEditSave = async (id) => {
        if (!editName.trim()) return;
        try {
            await fetch(`${API_URL}/connectors/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            });
            setEditingId(null);
            await fetchConnectors();
        } catch (e) { console.error("Edit failed", e); }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await fetchConnectors();
        } finally {
            setTimeout(() => setIsRefreshing(false), 500); // 500ms for visual feedback
        }
    };

    const handleAddConnector = async (e) => {
        e.preventDefault();
        const payload = { name: newConnectorName.trim() };

        if (connectType === 'stdio') {
            if (!newConnectorCommand.trim()) return;
            payload.command = newConnectorCommand;
            payload.args = newConnectorArgs ? newConnectorArgs.split(',').map(s => s.trim()) : [];
        } else {
            if (!newConnectorUrl.trim()) return;
            payload.url = newConnectorUrl;
        }

        try {
            const resp = await fetch(`${API_URL}/connectors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errData = await resp.json();
                console.error("Server Error while adding connector", errData);
                alert(`Error: ${errData.error || 'Failed to connect'}`);
            }

            await fetchConnectors();
        } catch (e) { console.error("Failed to add connector", e); }

        setNewConnectorName(''); setNewConnectorCommand(''); setNewConnectorArgs(''); setNewConnectorUrl('');
        setIsAddingMode(false);
    };

    const activeCount = connectors.filter(c => c.status === 'connected').length;

    return (
        <div className="dropdown-container" ref={dropdownRef}>
            <button
                className="btn btn-secondary flex items-center gap-2"
                onClick={() => setIsOpen(!isOpen)}
                style={{ fontSize: '0.875rem', backgroundColor: 'white' }}
            >
                <Server size={16} style={{ color: 'var(--accent)' }} />
                <span>Connectors ({activeCount})</span>
                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {isOpen && (
                <div className="dropdown-menu">
                    <div className="dropdown-header">
                        <div className="flex items-center gap-2">
                            <span>MCP Servers</span>
                            <button
                                onClick={handleRefresh}
                                title="Manual Sync/Refresh"
                                className={`btn-ghost rounded-full p-1 ${isRefreshing ? 'animate-spin' : ''}`}
                                style={{ color: 'var(--accent)' }}
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                        {!isAddingMode && (
                            <button className="btn btn-ghost btn-small flex items-center gap-2" onClick={() => setIsAddingMode(true)}>
                                <Box size={14} /> Add New
                            </button>
                        )}
                    </div>

                    {isAddingMode && (
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                            <div className="flex gap-2" style={{ marginBottom: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); setConnectType('stdio'); }}
                                    className={`btn flex-1 flex items-center justify-center gap-2 ${connectType === 'stdio' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                                >
                                    <Terminal size={14} /> Command
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); setConnectType('link'); }}
                                    className={`btn flex-1 flex items-center justify-center gap-2 ${connectType === 'link' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                                >
                                    <LinkIcon size={14} /> Link (SSE)
                                </button>
                            </div>

                            <form onSubmit={handleAddConnector} className="flex flex-col gap-2">
                                <input autoFocus type="text" value={newConnectorName} onChange={(e) => setNewConnectorName(e.target.value)} placeholder="Server Name (e.g. SQLite)" className="input" style={{ padding: '0.5rem', fontSize: '0.875rem' }} />

                                {connectType === 'stdio' ? (
                                    <>
                                        <input required type="text" value={newConnectorCommand} onChange={(e) => setNewConnectorCommand(e.target.value)} placeholder="Command (e.g. node, python)" className="input" style={{ padding: '0.5rem', fontSize: '0.875rem' }} />
                                        <input type="text" value={newConnectorArgs} onChange={(e) => setNewConnectorArgs(e.target.value)} placeholder="Args (server.js, --port 80)" className="input" style={{ padding: '0.5rem', fontSize: '0.875rem' }} />
                                    </>
                                ) : (
                                    <input required type="url" value={newConnectorUrl} onChange={(e) => setNewConnectorUrl(e.target.value)} placeholder="SSE URL (http://localhost:8080/sse)" className="input" style={{ padding: '0.5rem', fontSize: '0.875rem' }} />
                                )}

                                <div className="flex justify-between" style={{ marginTop: '0.5rem' }}>
                                    <button type="button" onClick={() => setIsAddingMode(false)} className="btn btn-ghost btn-small">Cancel</button>
                                    <button type="submit" className="btn btn-primary btn-small">Connect Server</button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                        {connectors.length === 0 && !isAddingMode && (
                            <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No servers connected.</div>
                        )}
                        {connectors.map(connector => (
                            <div key={connector.id} className="connector-item">
                                <div className="connector-info" style={{ flex: 1 }}>
                                    {editingId === connector.id ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="input p-1 text-xs"
                                                onKeyDown={(e) => e.key === 'Enter' && handleEditSave(connector.id)}
                                            />
                                            <button onClick={() => handleEditSave(connector.id)} className="text-success"><Check size={14} /></button>
                                            <button onClick={() => setEditingId(null)} className="text-secondary"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="connector-name">{connector.name}</span>
                                            <button
                                                onClick={() => { setEditingId(connector.id); setEditName(connector.name); }}
                                                className="text-gray-400 hover:text-gray-600"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                        </div>
                                    )}
                                    {connector.status === 'connected' ? (
                                        <span className="connector-status">Connected</span>
                                    ) : (
                                        <span className="connector-status" style={{ color: connector.status === 'error' ? 'var(--error)' : 'var(--text-secondary)' }}>
                                            {connector.status === 'error' ? 'Connection Error' : 'Disconnected'}
                                        </span>
                                    )}
                                    {connector.status === 'connected' && connector.tools && connector.tools.length > 0 && (
                                        <div className="connector-tools">
                                            Tools: {connector.tools.join(', ')}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => toggleStatus(connector.id, connector.status)}
                                    className="btn btn-ghost btn-small text-red-500 hover:bg-red-50"
                                    title="Remove/Disconnect"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}