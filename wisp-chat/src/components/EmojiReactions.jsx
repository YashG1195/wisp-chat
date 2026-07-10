import { useState } from "react";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../firebase";
import "../styles/EmojiReactions.css";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "⚡", "🎉"];

export default function EmojiReactions({ msgId, reactions = [], currentUid }) {
  const [showPicker, setShowPicker] = useState(false);

  // reactions: [{ emoji, uid }]
  const grouped = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push(r.uid);
  }

  async function toggleReaction(emoji) {
    const msgRef = doc(db, "messages", msgId);
    const existing = reactions.find((r) => r.emoji === emoji && r.uid === currentUid);
    if (existing) {
      await updateDoc(msgRef, { reactions: arrayRemove({ emoji, uid: currentUid }) });
    } else {
      await updateDoc(msgRef, { reactions: arrayUnion({ emoji, uid: currentUid }) });
    }
    setShowPicker(false);
  }

  const hasReactions = Object.keys(grouped).length > 0;

  return (
    <div className="emoji-reactions-wrapper">
      {/* Existing reaction pills */}
      {hasReactions && (
        <div className="reaction-pills">
          {Object.entries(grouped).map(([emoji, uids]) => {
            const iMine = uids.includes(currentUid);
            return (
              <button
                key={emoji}
                className={`reaction-pill ${iMine ? "mine" : ""}`}
                onClick={() => toggleReaction(emoji)}
                title={`${uids.length} reaction${uids.length > 1 ? "s" : ""}`}
              >
                {emoji} <span className="pill-count">{uids.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Add reaction button */}
      <div className="emoji-add-wrapper">
        <button
          className="emoji-add-btn"
          onClick={() => setShowPicker((v) => !v)}
          title="Add reaction"
        >
          😊+
        </button>

        {showPicker && (
          <div className="emoji-picker">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                className="emoji-option"
                onClick={() => toggleReaction(e)}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
