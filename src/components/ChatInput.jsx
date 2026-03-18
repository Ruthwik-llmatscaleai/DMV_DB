import { useState, useRef } from 'react';
import { Paperclip, ArrowUp, X } from 'lucide-react';

export default function ChatInput({ onSendMessage, disabled = false }) {
    const [message, setMessage] = useState('');
    const [files, setFiles] = useState([]);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleInput = (e) => {
        setMessage(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = '56px';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files)]);
        }
        e.target.value = null;
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = () => {
        if (disabled) return;
        if (message.trim() || files.length > 0) {
            onSendMessage({ text: message, files });
            setMessage('');
            setFiles([]);
            if (textareaRef.current) {
                textareaRef.current.style.height = '56px';
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const canSend = !disabled && (message.trim().length > 0 || files.length > 0);

    return (
        <div className="input-area">
            <div className="input-container" style={{
                opacity: disabled ? 0.7 : 1,
                transition: 'opacity 0.2s'
            }}>
                {files.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 pb-0">
                        {files.map((file, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white border rounded px-2 py-1 text-sm shadow-sm" style={{ borderColor: 'var(--border)' }}>
                                <span className="truncate max-w-[150px]">{file.name}</span>
                                <button
                                    onClick={() => removeFile(i)}
                                    className="text-gray-500 hover:text-black"
                                    disabled={disabled}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    className="chat-textarea"
                    placeholder={disabled ? 'Atlas is thinking...' : 'Message Atlas...'}
                    value={message}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={disabled}
                    style={{ cursor: disabled ? 'not-allowed' : 'text' }}
                />

                <div className="input-actions">
                    <div className="flex gap-2">
                        <input
                            type="file"
                            multiple
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            disabled={disabled}
                        />
                        <button
                            className="action-btn"
                            title="Upload file"
                            onClick={() => !disabled && fileInputRef.current?.click()}
                            disabled={disabled}
                        >
                            <Paperclip size={20} />
                        </button>
                    </div>

                    <button
                        className="action-btn send-btn"
                        disabled={!canSend}
                        onClick={handleSend}
                    >
                        <ArrowUp size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}