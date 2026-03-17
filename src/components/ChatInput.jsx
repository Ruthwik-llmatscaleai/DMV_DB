import { useState, useRef } from 'react';
import { Paperclip, ArrowUp, X } from 'lucide-react';

export default function ChatInput({ onSendMessage }) {
    const [message, setMessage] = useState('');
    const [files, setFiles] = useState([]);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleInput = (e) => {
        setMessage(e.target.value);
        // Auto-resize textarea
        if (textareaRef.current) {
            textareaRef.current.style.height = '56px'; // reset to min-height
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...selectedFiles]);
        }
        // reset input
        e.target.value = null;
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = () => {
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

    return (
        <div className="input-area">
            <div className="input-container">
                {files.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 pb-0">
                        {files.map((file, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white border rounded px-2 py-1 text-sm shadow-sm" style={{ borderColor: 'var(--border)' }}>
                                <span className="truncate max-w-[150px]">{file.name}</span>
                                <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-black">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    className="chat-textarea"
                    placeholder="Message DMV Assistant..."
                    value={message}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    rows={1}
                />

                <div className="input-actions">
                    <div className="flex gap-2">
                        <input
                            type="file"
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                        />
                        <button
                            className="action-btn"
                            title="Upload file"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Paperclip size={20} />
                        </button>
                    </div>

                    <button
                        className="action-btn send-btn"
                        disabled={!message.trim() && files.length === 0}
                        onClick={handleSend}
                    >
                        <ArrowUp size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
