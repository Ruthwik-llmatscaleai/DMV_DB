import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AtlasLogo = () => (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
        <ellipse cx="32" cy="32" rx="28" ry="11" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none" />
        <ellipse cx="32" cy="32" rx="11" ry="28" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none" />
        <circle cx="32" cy="32" r="3.5" fill="rgba(255,255,255,0.9)" />
        <circle cx="32" cy="4" r="2" fill="rgba(255,255,255,0.5)" />
        <circle cx="32" cy="60" r="2" fill="rgba(255,255,255,0.5)" />
        <circle cx="4" cy="32" r="2" fill="rgba(255,255,255,0.5)" />
        <circle cx="60" cy="32" r="2" fill="rgba(255,255,255,0.5)" />
    </svg>
);

export default function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        if (username === 'admin' && password === 'admin') {
            sessionStorage.setItem('atlas_logged_in', 'true');
            navigate('/chat');
        } else {
            setError('Invalid credentials. Please use admin/admin.');
        }
    };

    return (
        <div className="login-split">
            {/* Left side — background image with blue translucent overlay */}
            <div className="login-left">
                <div className="login-left-overlay" />
                <div className="login-left-content">
                    <AtlasLogo />
                    <h1 style={{
                        fontSize: '2.5rem',
                        fontWeight: 800,
                        marginBottom: '1rem',
                        textAlign: 'center',
                        lineHeight: 1.15,
                        color: 'white',
                        letterSpacing: '-0.02em',
                    }}>
                        Atlas AI
                    </h1>
                    <p style={{
                        fontSize: '1.05rem',
                        opacity: 0.85,
                        textAlign: 'center',
                        maxWidth: '380px',
                        lineHeight: 1.7,
                        color: 'white',
                    }}>
                        Build websites, query databases, convert Figma designs, and deploy — all from a single conversation.
                    </p>

                    <p style={{
                        position: 'absolute',
                        bottom: '1.5rem',
                        fontSize: '0.72rem',
                        color: 'rgba(255,255,255,0.4)',
                        letterSpacing: '0.05em',
                    }}>
                        Powered by LLMAtScale.ai
                    </p>
                </div>
            </div>

            {/* Right side — login form */}
            <div className="login-right">
                <div className="login-box">
                    <div className="login-header">
                        <h2>Welcome Back</h2>
                        <p>Sign in to your account</p>
                    </div>

                    {error && <div className="login-error">{error}</div>}

                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label htmlFor="username">Username</label>
                            <input
                                id="username"
                                type="text"
                                className="input"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                                autoComplete="username"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                className="input"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                autoComplete="current-password"
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary w-full"
                            style={{ marginTop: '1rem', padding: '0.875rem', fontSize: '1rem', fontWeight: 600 }}
                        >
                            Sign In
                        </button>
                    </form>

                    <p style={{
                        textAlign: 'center',
                        marginTop: '1.5rem',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                    }}>
                        LLMAtScale.ai · AI Platform
                    </p>
                </div>
            </div>
        </div>
    );
}
