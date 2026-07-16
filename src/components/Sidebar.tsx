import { useState } from 'react';
import { formatTime } from '../utils/time';
import './Sidebar.css';

interface Room {
  id: string;
  name: string;
  created_at: string;
  lastMessage?: string;
  lastTime?: string;
}

interface SidebarProps {
  rooms: Room[];
  activeRoomId: string | null;
  username: string;
  onSelectRoom: (id: string) => void;
  showCreateRoom: boolean;
  onToggleCreate: () => void;
  onCreateRoom: (name: string) => void;
}

export default function Sidebar({
  rooms,
  activeRoomId,
  username,
  onSelectRoom,
  showCreateRoom,
  onToggleCreate,
  onCreateRoom,
}: SidebarProps) {
  const [newRoomName, setNewRoomName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      onCreateRoom(newRoomName.trim());
      setNewRoomName('');
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Chat Room</h2>
        <div className="sidebar-user">
          <span className="user-avatar">{username.charAt(0).toUpperCase()}</span>
          <span className="user-name">{username}</span>
        </div>
      </div>

      <div className="room-list-header">
        <span className="room-count">{rooms.length} 个聊天室</span>
        <button className="add-room-btn" onClick={onToggleCreate} title="创建聊天室">
          +
        </button>
      </div>

      {showCreateRoom && (
        <form className="create-room-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="聊天室名称..."
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            maxLength={30}
            autoFocus
          />
          <button type="submit" disabled={!newRoomName.trim()}>
            创建
          </button>
        </form>
      )}

      <div className="room-list">
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          return (
            <div
              key={room.id}
              className={`room-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectRoom(room.id)}
            >
              <div className="room-avatar">#</div>
              <div className="room-info">
                <div className="room-name">{room.name}</div>
                <div className="room-preview">
                  {room.lastMessage || '加入聊天...'}
                </div>
              </div>
              {room.lastTime && (
                <div className="room-time">
                  {formatTime(room.lastTime)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
