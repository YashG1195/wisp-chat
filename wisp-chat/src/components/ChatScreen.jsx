import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase";
import MessageBubble from "./MessageBubble";
import "../styles/ChatScreen.css";

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function toDate(ts) {
  if (!ts) return null;
  return ts instanceof Timestamp ? ts.toDate() : new Date();
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateLabel(date) {
  if (!date) return "";
  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// Build rendering list with date separators and grouping info
function buildRenderList(messages) {
  const items = [];
  let lastDate = null;
  let lastUid = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgDate = toDate(msg.createdAt);

    // Date separator
    if (!isSameDay(msgDate, lastDate)) {
      items.push({ type: "date", label: formatDateLabel(msgDate), id: `date-${i}` });
      lastDate = msgDate;
      lastUid = null; // reset grouping after date separator
    }

    // Determine if this is part of a group (same sender as previous)
    const isFirstInGroup = msg.uid !== lastUid;
    const nextMsg = messages[i + 1];
    const isLastInGroup = !nextMsg || nextMsg.uid !== msg.uid;

    items.push({
      type: "message",
      msg,
      isFirstInGroup,
      isLastInGroup,
    });

    lastUid = msg.uid;
  }

  return items;
}

export default function ChatScreen({ user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Subscribe to messages in real time
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);

      // Estimate online count from unique senders in last 5 minutes
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentUids = new Set(
        msgs
          .filter((m) => {
            const d = toDate(m.createdAt);
            return d && d > fiveMinAgo;
          })
          .map((m) => m.uid)
      );
      // Always count at least the current user
      recentUids.add(user.uid);
      setOnlineCount(recentUids.size);
    });
    return () => unsubscribe();
  }, [user.uid]);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        text: trimmed,
        sender: user.displayName,
        uid: user.uid,
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
      });
      setText("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSend(e);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign-out error:", err);
    }
  }

  const renderList = buildRenderList(messages);

  return (
    <div className="chat-screen">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-brand">
          <span className="header-bolt">⚡</span>
          <div className="header-brand-text">
            <h1 className="chat-title">Wisp Chat</h1>
            <div className="chat-online">
              <span className="online-dot" />
              <span>{onlineCount} online</span>
            </div>
          </div>
        </div>
        <div className="chat-header-user">
          <div className="header-avatar">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
            ) : (
              <span>{getInitials(user.displayName)}</span>
            )}
          </div>
          <span className="header-name">{user.displayName}</span>
          <button className="signout-btn" onClick={handleSignOut} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="signout-label">Sign out</span>
          </button>
        </div>
      </header>

      {/* Message list */}
      <main className="message-list">
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="empty-bolt">⚡</span>
            <p>No messages yet. Say hello!</p>
          </div>
        )}

        {renderList.map((item) => {
          if (item.type === "date") {
            return (
              <div key={item.id} className="date-separator">
                <span>{item.label}</span>
              </div>
            );
          }
          return (
            <MessageBubble
              key={item.msg.id}
              msg={item.msg}
              isMine={item.msg.uid === user.uid}
              isFirstInGroup={item.isFirstInGroup}
              isLastInGroup={item.isLastInGroup}
              currentUid={user.uid}
            />
          );
        })}

        <div ref={bottomRef} />
      </main>

      {/* Input form */}
      <form className="message-form" onSubmit={handleSend}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          autoComplete="off"
        />
        <button type="submit" disabled={!text.trim() || sending} className="send-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  );
}
