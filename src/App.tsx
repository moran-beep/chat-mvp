import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import MessageInput from './components/MessageInput';
import Login from './components/Login';
import CallModal from './components/CallModal';
import { useChat } from './hooks/useChat';
import { useCall } from './hooks/useCall';
import './App.css';

export default function App() {
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('chat_username') || '';
  });

  const handleLogin = (name: string) => {
    localStorage.setItem('chat_username', name);
    setUsername(name);
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_username');
    setUsername('');
  };

  if (!username) {
    return <Login onLogin={handleLogin} />;
  }

  return <ChatApp username={username} onLogout={handleLogout} />;
}

function ChatApp({ username, onLogout }: { username: string; onLogout: () => void }) {
  const {
    rooms,
    messages,
    activeRoom,
    activeRoomId,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    sendMessage,
    createRoom,
    setActiveRoomId,
  } = useChat(username);

  const {
    status: callStatus,
    callerName,
    duration,
    isMuted,
    error: callError,
    audioBlocked,
    iceState,
    onlineUsers,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    unlockAudio,
  } = useCall(activeRoomId, username);

  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const handleCreateRoom = (name: string) => {
    createRoom(name);
    setShowCreateRoom(false);
  };

  // 本聊天室内出现过的成员（用于指定呼叫对象），排除自己
  const participants = Array.from(new Set(messages.map((m) => m.username))).filter(
    (u) => u && u !== username
  );

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>连接中...</p>
      </div>
    );
  }

  const callActive = callStatus === 'connected' || callStatus === 'calling' || callStatus === 'connecting';

  return (
    <div className="app-container">
      <Sidebar
        rooms={rooms}
        activeRoomId={activeRoomId}
        username={username}
        onSelectRoom={setActiveRoomId}
        showCreateRoom={showCreateRoom}
        onToggleCreate={() => setShowCreateRoom(!showCreateRoom)}
        onCreateRoom={handleCreateRoom}
        onLogout={onLogout}
      />
      <div className="chat-area">
        {activeRoom ? (
          <>
            <ChatWindow
              messages={messages}
              activeRoom={activeRoom}
              username={username}
              callActive={callActive}
              onCall={startCall}
              participants={participants}
              onlineUsers={onlineUsers}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
            />
            <MessageInput
              onSend={sendMessage}
              placeholder={`在 #${activeRoom.name} 发消息...`}
            />
          </>
        ) : (
          <div className="no-room">
            <p>选择一个聊天室开始聊天</p>
          </div>
        )}
      </div>
      <CallModal
        status={callStatus}
        callerName={callerName}
        duration={duration}
        isMuted={isMuted}
        error={callError}
        audioBlocked={audioBlocked}
        iceState={iceState}
        onAccept={acceptCall}
        onDecline={declineCall}
        onEnd={endCall}
        onToggleMute={toggleMute}
        onUnlockAudio={unlockAudio}
        currentUsername={username}
      />
    </div>
  );
}
