import { useRef, useState } from "react";
import { deleteDoc, doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
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

// Helper to highlight search terms
function HighlightText({ text, highlight }) {
  if (!highlight.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${highlight})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="search-highlight">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
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

// Inline edit form
function InlineEdit({ msg, onCancel }) {
  const [editText, setEditText] = useState(msg.text || "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);
  const MAX = 500;

  const trimmed = editText.trim();
  const isUnchanged = trimmed === (msg.text || "").trim();
  const isEmpty = trimmed.length === 0;
  const canSave = !isEmpty && !isUnchanged && trimmed.length <= MAX && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "messages", msg.id), {
        text: trimmed,
        edited: true,
        editedAt: serverTimestamp(),
      });
      onCancel(); // exit edit mode after save
    } catch (err) {
      console.error("Edit error:", err);
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") { onCancel(); return; }
    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSave(); }
  }

  // Focus textarea on mount
  useState(() => {
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 0);
  });

  const remaining = MAX - editText.length;

  return (
    <div className="inline-edit-form">
      <textarea
        ref={textareaRef}
        className="inline-edit-textarea"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX}
        rows={3}
        autoFocus
      />
      <div className="inline-edit-footer">
        <span className={`inline-edit-count ${remaining < 20 ? "warn" : ""}`}>
          {remaining} left
        </span>
        <div className="inline-edit-actions">
          <button className="inline-edit-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="inline-edit-save"
            onClick={handleSave}
            disabled={!canSave}
            title="Ctrl+Enter"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <p className="inline-edit-hint">Ctrl+Enter to save · Esc to cancel</p>
    </div>
  );
}

export default function MessageBubble({ msg, isMine, isFirstInGroup, isLastInGroup, currentUid, searchTerm = "" }) {
  const showAvatar = !isMine && isLastInGroup;
  const showSender = !isMine && isFirstInGroup;
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Extract URLs from text only (not from image messages)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = msg.imageUrl ? [] : Array.from(new Set((msg.text || "").match(urlRegex) || []));

  // Tooltip for edited label
  const editedAtFormatted = msg.editedAt
    ? (msg.editedAt instanceof Timestamp ? msg.editedAt.toDate() : new Date())
        .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <div
        className={[
          "msg-row",
          isMine ? "mine" : "theirs",
          isFirstInGroup ? "first-in-group" : "",
          isLastInGroup ? "last-in-group" : "",
          isEditing ? "editing" : "",
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
          {showSender && (
            <div className="msg-sender">
              <HighlightText text={msg.sender} highlight={searchTerm} />
            </div>
          )}

          {/* Bubble + action buttons wrapper */}
          <div className="msg-bubble-row">
            {/* Action buttons — only for mine messages, appear on hover */}
            {isMine && !isEditing && (
              <div className="msg-actions">
                {/* Edit button — text messages only */}
                {!msg.imageUrl && (
                  <button
                    className="msg-action-btn msg-edit-btn"
                    onClick={() => setIsEditing(true)}
                    title="Edit message"
                    aria-label="Edit message"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                )}
                {/* Delete button */}
                <button
                  className="msg-action-btn msg-delete-btn"
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
              </div>
            )}

            <div className={`msg-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}${isEditing ? " bubble-editing" : ""}`}>
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

              {/* Inline edit mode OR normal text */}
              {isEditing ? (
                <InlineEdit msg={msg} onCancel={() => setIsEditing(false)} />
              ) : (
                <>
                  {msg.text && (
                    <span className="msg-text">
                      <HighlightText text={msg.text} highlight={searchTerm} />
                      {msg.edited && (
                        <span
                          className="msg-edited-label"
                          title={editedAtFormatted ? `Edited at ${editedAtFormatted}` : "Edited"}
                        >
                          {" "}(edited)
                        </span>
                      )}
                    </span>
                  )}

                  {/* Link previews (text-only messages) */}
                  {urls.map((url, i) => (
                    <LinkPreview key={i} url={url} />
                  ))}
                </>
              )}

              {!isEditing && isLastInGroup && (
                <span className="msg-time">{formatTime(msg.createdAt)}</span>
              )}
            </div>
          </div>

          {/* Emoji reactions */}
          {!isEditing && (
            <EmojiReactions
              msgId={msg.id}
              reactions={msg.reactions || []}
              currentUid={currentUid}
            />
          )}
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
