import { useState } from 'react';
import './Login.css';

interface LoginProps {
  onLogin: (username: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2) return;
    onLogin(trimmed);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-icon">💬</div>
        <h1>Chat Room</h1>
        <p className="login-subtitle">输入你的名字，开始聊天</p>
        <form onSubmit={handleSubmit}>
          <input
            className="login-input"
            type="text"
            placeholder="你的名字（至少2个字符）"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            autoFocus
          />
          <button
            className="login-btn"
            type="submit"
            disabled={username.trim().length < 2}
          >
            进入聊天
          </button>
        </form>
      </div>
    </div>
  );
}
