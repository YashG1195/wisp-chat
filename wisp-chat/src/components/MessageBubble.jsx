import { deleteDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import EmojiReactions from "./EmojiReactions";
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

async function handleDelete(msgId) {
  try {
    await deleteDoc(doc(db, "messages", msgId));
  } catch (err) {
    console.error("Delete error:", err);
  }
}

export default function MessageBubble({ msg, isMine, isFirstInGroup, isLastInGroup, currentUid }) {
  const showAvatar = !isMine && isLastInGroup;
  const showSender = !isMine && isFirstInGroup;

  return (
    <div
      className={[
        "msg-row",
        isMine ? "mine" : "theirs",
        isFirstInGroup ? "first-in-group" : "",
        isLastInGroup ? "last-in-group" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Theirs: avatar slot */}
      {!isMine && (
        <div className="msg-avatar-slot">
          {showAvatar ? (
            <div className="msg-avatar">
              {msg.photoURL ? (
                <img src={msg.photoURL} alt={msg.sender} referrerPolicy="no-referrer" />
              ) : (
                <span>{getInitials(msg.sender)}</span>
              )}
            </div>
          ) : (
            <div className="msg-avatar-placeholder" />
          )}
        </div>
      )}

      <div className="msg-content">
        {showSender && <div className="msg-sender">{msg.sender}</div>}

        {/* Bubble + delete button wrapper */}
        <div className="msg-bubble-row">
          {/* Delete button — only for mine, appears on hover */}
          {isMine && (
            <button
              className="msg-delete-btn"
              onClick={() => handleDelete(msg.id)}
              title="Delete message"
              aria-label="Delete message"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          )}

          <div className={`msg-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
            <span className="msg-text">{msg.text}</span>
            {isLastInGroup && (
              <span className="msg-time">{formatTime(msg.createdAt)}</span>
            )}
          </div>
        </div>

        {/* Emoji reactions */}
        <EmojiReactions
          msgId={msg.id}
          reactions={msg.reactions || []}
          currentUid={currentUid}
        />
      </div>

      {/* Mine: avatar slot */}
      {isMine && (
        <div className="msg-avatar-slot">
          {showAvatar || isLastInGroup ? (
            <div className="msg-avatar mine-avatar">
              {msg.photoURL ? (
                <img src={msg.photoURL} alt={msg.sender} referrerPolicy="no-referrer" />
              ) : (
                <span>{getInitials(msg.sender)}</span>
              )}
            </div>
          ) : (
            <div className="msg-avatar-placeholder" />
          )}
        </div>
      )}
    </div>
  );
}
