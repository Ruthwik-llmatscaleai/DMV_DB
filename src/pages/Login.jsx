import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // Hardcoded credentials as requested
    if (username === 'admin' && password === 'admin') {
      navigate('/chat');
    } else {
      setError('Invalid credentials. Please use admin/admin.');
    }
  };

  return (
    <div className="login-split">
      <div className="login-left">
        <img src="https://upload.wikimedia.org/wikipedia/commons/e/ec/California_Department_of_Motor_Vehicles_logo.svg" alt="California DMV Logo" style={{ width: '220px', height: 'auto', marginBottom: '2.5rem', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }} />
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem', textAlign: 'center', lineHeight: '1.2' }}>
          Welcome to the future of administration
        </h1>
        <p style={{ fontSize: '1.25rem', opacity: 0.9, textAlign: 'center', maxWidth: '480px', lineHeight: '1.6' }}>
          Connect seamlessly to internal tools and databases. The modern ecosystem for vehicle records and intelligent document processing.
        </p>
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
                onChange={(e) => setUsername(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" style={{ marginTop: '1rem' }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
