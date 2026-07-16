interface ChatHeaderProps {
  roomName: string;
}

export default function ChatHeader({ roomName }: ChatHeaderProps) {
  return (
    <div className="chat-header">
      <div className="chat-header-info">
        <span className="chat-header-hash">#</span>
        <span className="chat-header-name">{roomName}</span>
      </div>
    </div>
  );
}
