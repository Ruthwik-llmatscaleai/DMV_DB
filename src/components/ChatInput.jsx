import { useState, useRef } from 'react';
import { ArrowUp } from 'lucide-react';

export default function ChatInput({ onSendMessage, disabled = false }) {
    const [message, setMessage] = useState('');
    const textareaRef = useRef(null);

    const handleInput = (e) => {
        setMessage(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = '56px';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    };

    const handleSend = () => {
        if (disabled) return;
        if (message.trim()) {
            onSendMessage({ text: message });
            setMessage('');
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

    const canSend = !disabled && message.trim().length > 0;

    return (
        <div className="input-area">
            <div className="input-container" style={{
                opacity: disabled ? 0.7 : 1,
                transition: 'opacity 0.2s'
            }}>
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
                    <div />
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