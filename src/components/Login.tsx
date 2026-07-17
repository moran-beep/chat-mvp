import { useState } from 'react';
import './Login.css';
import { saveTrtcConfig, isTrtcConfigured } from '../lib/trtc';

interface LoginProps {
  onLogin: (username: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2) return;
    onLogin(trimmed);
  };

  const handleSaveConfig = () => {
    const id = Number(appId.trim());
    if (id > 0 && secret.trim()) {
      saveTrtcConfig(id, secret.trim());
      setAppId('');
      setSecret('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const configured = isTrtcConfigured();

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

        <button
          type="button"
          className="login-config-toggle"
          onClick={() => setShowConfig(!showConfig)}
        >
          {showConfig ? '收起配置 ▲' : '⚙️ 配置跨网通话（可选）'}
        </button>

        {showConfig && (
          <div className="login-config">
            <p className={`login-config-status ${configured ? 'ok' : 'warn'}`}>
              {configured ? '✅ 已配置音视频服务，可跨网通话' : '⚠️ 未配置，仅同网络可通话'}
            </p>
            <p className="login-config-tip">
              填入腾讯云 TRTC 的 SDKAppID 和 SecretKey，即可在不同网络（WiFi / 手机流量）间通话。
            </p>
            <input
              className="login-input"
              type="number"
              placeholder="SDKAppID"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
            <input
              className="login-input"
              type="password"
              placeholder="SecretKey"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <button
              type="button"
              className="login-btn login-btn-small"
              onClick={handleSaveConfig}
              disabled={!appId.trim() || !secret.trim()}
            >
              保存配置
            </button>
            {saved && <p className="login-config-ok">已保存 ✅</p>}
          </div>
        )}
      </div>
    </div>
  );
}
