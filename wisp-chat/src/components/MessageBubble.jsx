import { useState } from "react";
import { deleteDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import EmojiReactions from "./EmojiReactions";
import LinkPreview from "./LinkPreview";
import "../styles/MessageBubble.css";

function formatTime(ts) {
  if (!ts) return "";
  const date = ts instanceof Timestamp ? ts.toDate() : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

async function handleDelete(msgId) {
  try {
    await deleteDoc(doc(db, "messages", msgId));
  } catch (err) {
    console.error("Delete error:", err);
  }
}

// Lightbox component
function Lightbox({ src, onClose }) {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt="Full size" className="lightbox-img" />
        <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
    </div>
  );
}

export default function MessageBubble({ msg, isMine, isFirstInGroup, isLastInGroup, currentUid }) {
  const showAvatar = !isMine && isLastInGroup;
  const showSender = !isMine && isFirstInGroup;
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [imgError, setImgError] = useState(false);

  // Extract URLs from text only (not from image messages)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = msg.imageUrl ? [] : Array.from(new Set((msg.text || "").match(urlRegex) || []));

  return (
    <>
      <div
        className={[
          "msg-row",
          isMine ? "mine" : "theirs",
          isFirstInGroup ? "first-in-group" : "",
          isLastInGroup ? "last-in-group" : "",
        ].filter(Boolean).join(" ")}
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
              {/* Image message */}
              {msg.imageUrl && (
                <div className="msg-image-wrapper">
                  {imgError ? (
                    <div className="msg-image-error">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="3"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                      </svg>
                      <span>Image unavailable</span>
                    </div>
                  ) : (
                    <img
                      src={msg.imageUrl}
                      alt="shared image"
                      className="msg-image"
                      onClick={() => setLightboxSrc(msg.imageUrl)}
                      onError={() => setImgError(true)}
                    />
                  )}
                </div>
              )}

              {/* Text / caption */}
              {msg.text && <span className="msg-text">{msg.text}</span>}

              {/* Link previews (text-only messages) */}
              {urls.map((url, i) => (
                <LinkPreview key={i} url={url} />
              ))}

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

      {/* Lightbox */}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
