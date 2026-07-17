import { useState, useRef, useEffect } from 'react';

interface ChatHeaderProps {
  roomName: string;
  callActive: boolean;
  currentUser: string;
  participants: string[];
  onlineUsers: string[];
  onCall: (target: string) => void;
}

export default function ChatHeader({ roomName, callActive, currentUser, participants, onlineUsers, onCall }: ChatHeaderProps) {
  const [showPicker, setShowPicker] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onlineSet = new Set(onlineUsers);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const others = participants.filter((u) => u && u !== currentUser);

  const handlePick = (target: string) => {
    setShowPicker(false);
    onCall(target);
  };

  return (
    <div className="chat-header">
      <div className="chat-header-info">
        <span className="chat-header-hash">#</span>
        <span className="chat-header-name">{roomName}</span>
      </div>
      <div className="call-picker-wrap" ref={wrapRef}>
        <button
          className={`call-header-btn ${callActive ? 'active' : ''}`}
          onClick={() => setShowPicker((v) => !v)}
          title={callActive ? '通话中' : '呼叫聊天室成员'}
          disabled={callActive}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
              fill={callActive ? '#22c55e' : '#667eea'}
            />
          </svg>
        </button>
        {showPicker && !callActive && (
          <div className="call-picker">
            <div className="call-picker-title">呼叫成员</div>
            {others.length === 0 ? (
              <div className="call-picker-empty">聊天室里还没有其他人</div>
            ) : (
              others.map((u) => {
                const isOnline = onlineSet.has(u);
                return (
                  <button key={u} className="call-picker-item" onClick={() => handlePick(u)}>
                    <span className="call-picker-avatar">{u.charAt(0).toUpperCase()}</span>
                    <span className="call-picker-name">{u}</span>
                    <span className={`call-picker-dot ${isOnline ? 'online' : ''}`} title={isOnline ? '在线' : '离线'} />
                    <span className="call-picker-call">📞</span>
                  </button>
                );
              })
            )}
            <button
              className="call-picker-room"
              onClick={() => {
                setShowPicker(false);
                onCall('');
              }}
            >
              呼叫整个房间
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
