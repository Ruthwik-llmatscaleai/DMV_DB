import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Server, Power, Box, Link as LinkIcon, Terminal } from 'lucide-react';

export default function ConnectorsDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [isAddingMode, setIsAddingMode] = useState(false);
    const [connectType, setConnectType] = useState('stdio');

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
        if (currentStatus === 'connected') {
            await fetch(`${API_URL}/connectors/${id}`, { method: 'DELETE' });
            await fetchConnectors();
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
            await fetch(`${API_URL}/connectors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await fetchConnectors();
        } catch (e) { console.error("Failed to add connector", e); }

        setNewConnectorName(''); setNewConnectorCommand(''); setNewConnectorArgs(''); setNewConnectorUrl('');
        setIsAddingMode(false);
    };

    const activeCount = connectors.filter(c => c.status === 'connected').length;

    return (
        <div className="dropdown-container relative z-50" ref={dropdownRef}>
            <button
                className="btn btn-secondary flex items-center gap-2 bg-white border border-gray-200 shadow-sm px-4 py-2 rounded-md hover:bg-gray-50"
                onClick={() => setIsOpen(!isOpen)}
            >
                <Server size={16} className="text-blue-600" />
                <span className="font-medium">Connectors ({activeCount})</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                    <div className="flex justify-between items-center bg-gray-50 px-4 py-3 border-b border-gray-100">
                        <span className="font-semibold text-gray-700">MCP Servers</span>
                        {!isAddingMode && (
                            <button className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium" onClick={() => setIsAddingMode(true)}>
                                <Box size={14} /> Add New
                            </button>
                        )}
                    </div>

                    {isAddingMode && (
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                            {/* Neat Tab Options */}
                            <div className="flex p-1 bg-gray-200 rounded-md mb-4">
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); setConnectType('stdio'); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded ${connectType === 'stdio' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Terminal size={14} /> Command
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); setConnectType('link'); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded ${connectType === 'link' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <LinkIcon size={14} /> Link (SSE)
                                </button>
                            </div>

                            <form onSubmit={handleAddConnector} className="flex flex-col gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Server Name</label>
                                    <input autoFocus type="text" value={newConnectorName} onChange={(e) => setNewConnectorName(e.target.value)} placeholder="e.g. SQLite Database" className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>

                                {connectType === 'stdio' ? (
                                    <>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Command</label>
                                            <input required type="text" value={newConnectorCommand} onChange={(e) => setNewConnectorCommand(e.target.value)} placeholder="e.g. node or python" className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Arguments (comma separated)</label>
                                            <input type="text" value={newConnectorArgs} onChange={(e) => setNewConnectorArgs(e.target.value)} placeholder="e.g. server.js, --port, 8080" className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">SSE URL</label>
                                        <input required type="url" value={newConnectorUrl} onChange={(e) => setNewConnectorUrl(e.target.value)} placeholder="http://localhost:8080/sse" className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>
                                )}

                                <div className="flex gap-2 justify-end mt-2">
                                    <button type="button" onClick={() => setIsAddingMode(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                                    <button type="submit" className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium shadow-sm">Connect Server</button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="max-h-60 overflow-y-auto p-2">
                        {connectors.length === 0 && !isAddingMode && (
                            <div className="text-center p-4 text-sm text-gray-500">No servers connected.</div>
                        )}
                        {connectors.map(connector => (
                            <div key={connector.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-md group">
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-gray-800">{connector.name}</span>
                                    {connector.status === 'connected' ? (
                                        <span className="text-xs text-green-600 flex items-center gap-1 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Connected</span>
                                    ) : (
                                        <span className="text-xs text-gray-400">Disconnected</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => toggleStatus(connector.id, connector.status)}
                                    className={`p-1.5 rounded-md ${connector.status === 'connected' ? 'text-red-500 hover:bg-red-50' : 'text-gray-400'}`}
                                    title="Disconnect"
                                >
                                    <Power size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}