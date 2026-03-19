import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      sessionStorage.setItem('dmv_logged_in', 'true');
      navigate('/chat');
    } else {
      setError('Invalid credentials. Please use admin/admin.');
    }
  };

  return (
    <div className="login-split">
      <div className="login-left">
        {/* Local SVG first, Wikipedia as fallback, then text badge as last resort */}
        {!logoError ? (
          <img
            src="/dmv-logo.svg"
            alt="California DMV Logo"
            style={{
              width: '240px',
              height: 'auto',
              marginBottom: '2.5rem',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
            }}
            onError={() => setLogoError(true)}
          />
        ) : (
          /* Text fallback badge if SVG can't load */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '2.5rem',
            gap: '0.5rem',
          }}>
            <div style={{
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.15)',
              border: '3px solid rgba(255,255,255,0.4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-1px', color: 'white' }}>CA</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '4px', color: 'white' }}>DMV</span>
            </div>
          </div>
        )}

        <h1 style={{
          fontSize: '2.75rem',
          fontWeight: 800,
          marginBottom: '1.5rem',
          textAlign: 'center',
          lineHeight: '1.2',
          color: 'white',
        }}>
          Welcome to the future of administration
        </h1>
        <p style={{
          fontSize: '1.15rem',
          opacity: 0.9,
          textAlign: 'center',
          maxWidth: '480px',
          lineHeight: '1.7',
          color: 'white',
        }}>
          Connect seamlessly to internal tools and databases. The modern ecosystem
          for vehicle records and intelligent document processing.
        </p>

        {/* Decorative dots */}
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '0.5rem',
          opacity: 0.5,
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'white',
            }} />
          ))}
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <div className="login-header">
            <h2>Welcome Back</h2>
            <p>Log in to your account</p>
          </div>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="input"
                placeholder="Enter username (admin)"
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              style={{ marginTop: '1rem', padding: '0.875rem' }}
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
            California Department of Motor Vehicles · Secure Portal
          </p>
        </div>
      </div>
    </div>
  );
}