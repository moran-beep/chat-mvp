import { useChat } from './hooks/useChat';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import './App.css';

export default function App() {
  const {
    conversations,
    activeConversation,
    activeConversationId,
    isTyping,
    sendMessage,
    selectConversation,
  } = useChat();

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={selectConversation}
      />
      <main className="chat-area">
        <ChatHeader conversation={activeConversation} isTyping={isTyping} />
        <ChatWindow conversation={activeConversation} isTyping={isTyping} />
        <MessageInput onSend={sendMessage} />
      </main>
    </div>
  );
}
