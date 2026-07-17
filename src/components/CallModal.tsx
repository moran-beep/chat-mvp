import type { CallStatus } from '../hooks/useCall';
import './CallModal.css';

interface CallModalProps {
  status: CallStatus;
  callerName: string;
  duration: number;
  isMuted: boolean;
  error: string;
  audioBlocked: boolean;
  iceState: string;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onUnlockAudio: () => void;
  currentUsername: string;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CallModal({
  status,
  callerName,
  duration,
  isMuted,
  error,
  audioBlocked,
  iceState,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onUnlockAudio,
  currentUsername,
}: CallModalProps) {
  if (status === 'idle' && !error) return null;

  // Incoming call — ringing (someone is calling me)
  if (status === 'ringing') {
    return (
      <div className="call-overlay">
        <div className="call-card incoming">
          <div className="call-avatar">
            {callerName.charAt(0).toUpperCase()}
          </div>
          <div className="call-pulse" />
          <h3 className="call-title">{callerName}</h3>
          <p className="call-subtitle">来电中...</p>
          {error && <p className="call-error">{error}</p>}
          <div className="call-actions">
            <button className="call-btn decline" onClick={onDecline} title="拒绝">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M2 4l20 16M22 4L2 20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button className="call-btn accept" onClick={onAccept} title="接听">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Outgoing call — calling (I initiated, waiting for answer)
  if (status === 'calling') {
    return (
      <div className="call-overlay">
        <div className="call-card outgoing">
          <div className="call-avatar self">
            {currentUsername.charAt(0).toUpperCase()}
          </div>
          <div className="call-pulse" />
          <h3 className="call-title">正在呼叫...</h3>
          <p className="call-subtitle">等待对方接听</p>
          {error && <p className="call-error">{error}</p>}
          <div className="call-actions">
            <button className="call-btn decline" onClick={onEnd} title="取消">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white" transform="rotate(135 12 12)"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Connecting — SDP exchanged, waiting for ICE to connect
  if (status === 'connecting') {
    return (
      <div className="call-overlay">
        <div className="call-card connecting">
          <div className="call-avatar connecting-avatar">
            {callerName.charAt(0).toUpperCase() || currentUsername.charAt(0).toUpperCase()}
          </div>
          <div className="call-spinner" />
          <h3 className="call-title">正在建立连接...</h3>
          <p className="call-subtitle">
            {iceState === 'checking' ? '正在穿透网络...' :
             iceState === 'new' ? '正在收集网络信息...' :
             '请稍候'}
          </p>
          {error && <p className="call-error">{error}</p>}
          <div className="call-actions">
            <button className="call-btn decline" onClick={onEnd} title="取消">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white" transform="rotate(135 12 12)"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Call connected
  if (status === 'connected') {
    return (
      <div className="call-overlay">
        <div
          className={`call-card connected ${audioBlocked ? 'audio-blocked' : ''}`}
          onClick={audioBlocked ? onUnlockAudio : undefined}
        >
          <div className="call-avatar connected-avatar">
            {callerName.charAt(0).toUpperCase()}
          </div>
          <div className="call-wave" />
          <h3 className="call-title">{callerName}</h3>
          <p className="call-duration">{formatDuration(duration)}</p>
          {audioBlocked && (
            <p className="call-audio-hint">👆 点击屏幕开启声音</p>
          )}
          {error && <p className="call-error">{error}</p>}
          <div className="call-actions">
            <button
              className={`call-btn mute ${isMuted ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
              title={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 3l18 18M12 4v9.5M8 9v6c0 2.21 1.79 4 4 4s4-1.79 4-4v-1M16 11V6c0-2.21-1.79-4-4-4-1.2 0-2.27.53-3 1.36" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zM5 11c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2c0 2.76-2.24 5-5 5s-5-2.24-5-5H5z" fill="white"/>
                </svg>
              )}
            </button>
            <button className="call-btn decline" onClick={(e) => { e.stopPropagation(); onEnd(); }} title="挂断">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white" transform="rotate(135 12 12)"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error state (after call ended with error)
  if (error && status === 'idle') {
    return (
      <div className="call-overlay">
        <div className="call-card error" onClick={onEnd} title="点击关闭">
          <div className="call-error-icon">!</div>
          <p className="call-error-text">{error}</p>
          <p className="call-error-hint">（点击关闭）</p>
        </div>
      </div>
    );
  }

  return null;
}
