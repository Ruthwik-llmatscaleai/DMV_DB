import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AtlasLogo = () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" fill="none" />
        <ellipse cx="24" cy="24" rx="20" ry="8" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" fill="none" />
        <ellipse cx="24" cy="24" rx="8" ry="20" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" fill="none" />
        <circle cx="24" cy="24" r="3" fill="rgba(129,140,248,0.9)" />
        <circle cx="24" cy="4" r="1.5" fill="rgba(255,255,255,0.6)" />
        <circle cx="24" cy="44" r="1.5" fill="rgba(255,255,255,0.6)" />
        <circle cx="4" cy="24" r="1.5" fill="rgba(255,255,255,0.6)" />
        <circle cx="44" cy="24" r="1.5" fill="rgba(255,255,255,0.6)" />
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
        <div className="login-page">
            {/* Mesh gradient background */}
            <div className="login-bg" />
            {/* Noise texture */}
            <div className="login-noise" />

            {/* Glass card */}
            <div className="login-card">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        <AtlasLogo />
                    </div>
                    <h1 style={{
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        color: 'white',
                        marginBottom: '0.4rem',
                        letterSpacing: '-0.02em',
                    }}>
                        Atlas AI
                    </h1>
                    <p style={{
                        fontSize: '0.9rem',
                        color: 'rgba(255,255,255,0.5)',
                        lineHeight: 1.5,
                    }}>
                        Your intelligent platform for everything
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: '10px',
                        padding: '0.7rem 1rem',
                        marginBottom: '1.25rem',
                        fontSize: '0.85rem',
                        color: '#fca5a5',
                        textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label className="login-label" htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            className="login-input"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setError(''); }}
                            autoComplete="username"
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label className="login-label" htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            className="login-input"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            autoComplete="current-password"
                        />
                    </div>

                    <button type="submit" className="login-submit">
                        Sign In
                    </button>
                </form>

                <p style={{
                    textAlign: 'center',
                    marginTop: '1.5rem',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.3)',
                }}>
                    LLMAtScale.ai · AI Platform
                </p>
            </div>
        </div>
    );
}
