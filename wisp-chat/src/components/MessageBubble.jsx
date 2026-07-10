import { Timestamp } from "firebase/firestore";
import "../styles/MessageBubble.css";

function formatTime(ts) {
  if (!ts) return "";
  const date = ts instanceof Timestamp ? ts.toDate() : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function MessageBubble({ msg, isMine }) {
  return (
    <div className={`msg-row ${isMine ? "mine" : "theirs"}`}>
      {!isMine && (
        <div className="msg-avatar">
          {msg.photoURL ? (
            <img src={msg.photoURL} alt={msg.sender} referrerPolicy="no-referrer" />
          ) : (
            <span>{getInitials(msg.sender)}</span>
          )}
        </div>
      )}

      <div className="msg-content">
        {!isMine && <div className="msg-sender">{msg.sender}</div>}
        <div className={`msg-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
          <span className="msg-text">{msg.text}</span>
          <span className="msg-time">{formatTime(msg.createdAt)}</span>
        </div>
      </div>

      {isMine && (
        <div className="msg-avatar mine-avatar">
          {msg.photoURL ? (
            <img src={msg.photoURL} alt={msg.sender} referrerPolicy="no-referrer" />
          ) : (
            <span>{getInitials(msg.sender)}</span>
          )}
        </div>
      )}
    </div>
  );
}
