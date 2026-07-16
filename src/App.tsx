import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import MessageInput from './components/MessageInput';
import Login from './components/Login';
import { useChat } from './hooks/useChat';
import './App.css';

export default function App() {
  const [username, setUsername] = useState<string>(() => {
    return sessionStorage.getItem('chat_username') || '';
  });

  const handleLogin = (name: string) => {
    sessionStorage.setItem('chat_username', name);
    setUsername(name);
  };

  if (!username) {
    return <Login onLogin={handleLogin} />;
  }

  return <ChatApp username={username} />;
}

function ChatApp({ username }: { username: string }) {
  const {
    rooms,
    messages,
    activeRoom,
    activeRoomId,
    loading,
    sendMessage,
    createRoom,
    setActiveRoomId,
  } = useChat(username);

  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const handleCreateRoom = (name: string) => {
    createRoom(name);
    setShowCreateRoom(false);
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>连接中...</p>
      </div>
    );
  }

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
      />
      <div className="chat-area">
        {activeRoom ? (
          <>
            <ChatWindow
              messages={messages}
              activeRoom={activeRoom}
              username={username}
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
    </div>
  );
}
