import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Server, Power, Box } from 'lucide-react';

export default function ConnectorsDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [isAddingMode, setIsAddingMode] = useState(false);
    const [connectType, setConnectType] = useState('stdio'); // 'stdio' or 'link'
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
        } catch (e) {
            console.error("Failed to fetch connectors:", e);
        }
    };

    useEffect(() => {
        fetchConnectors();
        // Poll every 5 seconds to get real-time status of tools
        const interval = setInterval(fetchConnectors, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const toggleStatus = async (id, currentStatus) => {
        if (currentStatus === 'connected') {
            try {
                await fetch(`${API_URL}/connectors/${id}`, { method: 'DELETE' });
                await fetchConnectors();
            } catch (e) {
                console.error("Disconnect Error", e);
            }
        }
    };

    const handleAddConnector = async (e) => {
        e.preventDefault();

        const payload = {
            name: newConnectorName.trim()
        };

        if (connectType === 'stdio') {
            if (!newConnectorCommand.trim()) return;
            payload.command = newConnectorCommand;
            payload.args = newConnectorArgs ? newConnectorArgs.split(',').map(s => s.trim()) : [];
        } else {
            if (!newConnectorUrl.trim()) return;
            payload.url = newConnectorUrl;
        }

        try {
            await fetch(`${API_URL}/connectors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await fetchConnectors();
        } catch (e) {
            console.error("Failed to add connector", e);
        }

        setNewConnectorName('');
        setNewConnectorCommand('');
        setNewConnectorArgs('');
        setNewConnectorUrl('');
        setIsAddingMode(false);
    };

    const activeCount = connectors.filter(c => c.status === 'connected').length;

    return (
        <div className="dropdown-container" ref={dropdownRef}>
            <button
                className="btn btn-secondary flex items-center gap-2"
                onClick={() => setIsOpen(!isOpen)}
                style={{ fontSize: '0.875rem' }}
            >
                <Server size={16} />
                <span>Connectors ({activeCount})</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {isOpen && (
                <div className="dropdown-menu">
                    <div className="dropdown-header">
                        <span>MCP Servers</span>
                        {!isAddingMode && (
                            <button
                                className="btn btn-ghost btn-small flex items-center gap-2"
                                onClick={() => setIsAddingMode(true)}
                            >
                                <Box size={14} /> Add New
                            </button>
                        )}
                    </div>

                    {isAddingMode && (
                        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                            <div className="flex gap-2 mb-3">
                                <button
                                    onClick={() => setConnectType('stdio')}
                                    className={`btn btn-small flex-1 ${connectType === 'stdio' ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ fontSize: '0.75rem' }}
                                >Stdio</button>
                                <button
                                    onClick={() => setConnectType('link')}
                                    className={`btn btn-small flex-1 ${connectType === 'link' ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ fontSize: '0.75rem' }}
                                >Link (SSE)</button>
                            </div>
                            <form onSubmit={handleAddConnector} className="flex flex-col gap-2">
                                <input
                                    autoFocus
                                    type="text"
                                    value={newConnectorName}
                                    onChange={(e) => setNewConnectorName(e.target.value)}
                                    placeholder="Name (e.g. SQLite)"
                                    className="input text-sm p-2"
                                />
                                {connectType === 'stdio' ? (
                                    <>
                                        <input
                                            required
                                            type="text"
                                            value={newConnectorCommand}
                                            onChange={(e) => setNewConnectorCommand(e.target.value)}
                                            placeholder="Command (e.g. node, python)"
                                            className="input text-sm p-2"
                                        />
                                        <input
                                            type="text"
                                            value={newConnectorArgs}
                                            onChange={(e) => setNewConnectorArgs(e.target.value)}
                                            placeholder="Args (server.js, --port 80)"
                                            className="input text-sm p-2"
                                        />
                                    </>
                                ) : (
                                    <input
                                        required
                                        type="url"
                                        value={newConnectorUrl}
                                        onChange={(e) => setNewConnectorUrl(e.target.value)}
                                        placeholder="SSE URL (http://locahost:8080/sse)"
                                        className="input text-sm p-2"
                                    />
                                )}
                                <div className="flex gap-2 justify-end mt-1">
                                    <button type="submit" className="btn btn-primary btn-small py-1 px-2">Connect</button>
                                    <button type="button" onClick={() => setIsAddingMode(false)} className="btn btn-ghost btn-small py-1 px-2">Cancel</button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="connectors-list">
                        {connectors.map(connector => (
                            <div key={connector.id} className="connector-item">
                                <div className="connector-info">
                                    <span className="connector-name">{connector.name}</span>
                                    {connector.status === 'connected' ? (
                                        <span className="connector-status">Connected</span>
                                    ) : (
                                        <span className="connector-status" style={{ color: 'var(--text-secondary)' }}>Disconnected</span>
                                    )}
                                    {connector.status === 'connected' && (
                                        <div className="connector-tools">
                                            Deployed tools: {connector.tools.join(', ')}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => toggleStatus(connector.id, connector.status)}
                                    className={`btn btn-small ${connector.status === 'connected' ? 'btn-ghost' : 'btn-primary'}`}
                                    style={{ color: connector.status === 'connected' ? 'var(--error)' : 'white' }}
                                >
                                    <Power size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
