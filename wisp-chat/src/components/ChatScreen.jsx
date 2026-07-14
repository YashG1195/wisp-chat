import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  doc,
  setDoc,
  deleteDoc,
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

function buildRenderList(messages) {
  const items = [];
  let lastDate = null;
  let lastUid = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgDate = toDate(msg.createdAt);

    if (!isSameDay(msgDate, lastDate)) {
      items.push({ type: "date", label: formatDateLabel(msgDate), id: `date-${i}` });
      lastDate = msgDate;
      lastUid = null;
    }

    const isFirstInGroup = msg.uid !== lastUid;
    const nextMsg = messages[i + 1];
    const isLastInGroup = !nextMsg || nextMsg.uid !== msg.uid;

    items.push({ type: "message", msg, isFirstInGroup, isLastInGroup });
    lastUid = msg.uid;
  }

  return items;
}

export default function ChatScreen({ user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  
  // Clear chat states
  const [clearTimestamp, setClearTimestamp] = useState(() => {
    return localStorage.getItem("wisp-chat-clear-timestamp") || null;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Subscribe to messages in real time
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);

      // Estimate online count
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentUids = new Set(
        msgs
          .filter((m) => { const d = toDate(m.createdAt); return d && d > fiveMinAgo; })
          .map((m) => m.uid)
      );
      recentUids.add(user.uid);
      setOnlineCount(recentUids.size);
    });
    return () => unsubscribe();
  }, [user.uid]);

  // Subscribe to typing indicators
  useEffect(() => {
    const q = query(collection(db, "typing"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const typers = snapshot.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((t) => t.uid !== user.uid && now - t.updatedAt < 5000);
      setTypingUsers(typers);
    });
    return () => unsubscribe();
  }, [user.uid]);

  // Auto-scroll only when near bottom
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const distFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingUsers]);

  // Scroll button visibility
  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const dist = list.scrollHeight - list.scrollTop - list.clientHeight;
    setShowScrollBtn(dist > 200);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Typing indicator management
  async function updateTyping(isTyping) {
    const typingRef = doc(db, "typing", user.uid);
    try {
      if (isTyping) {
        await setDoc(typingRef, {
          uid: user.uid,
          name: user.displayName,
          updatedAt: Date.now(),
        });
      } else {
        await deleteDoc(typingRef);
      }
    } catch (_) { /* ignore */ }
  }

  function handleTextChange(e) {
    setText(e.target.value);
    // Debounce: set typing, clear after 4s inactivity
    updateTyping(true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => updateTyping(false), 4000);
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    clearTimeout(typingTimerRef.current);
    updateTyping(false);

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
      // Scroll to bottom after sending
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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
    await updateTyping(false);
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign-out error:", err);
    }
  }

  function handleClearChat() {
    const now = new Date().toISOString();
    localStorage.setItem("wisp-chat-clear-timestamp", now);
    setClearTimestamp(now);
    setShowClearConfirm(false);
  }

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      updateTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleMessages = messages.filter((msg) => {
    if (!clearTimestamp) return true;
    const msgTime = toDate(msg.createdAt)?.getTime() || 0;
    const clearTime = new Date(clearTimestamp).getTime();
    return msgTime > clearTime;
  });

  const renderList = buildRenderList(visibleMessages);

  function formatTyping() {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return `${typingUsers[0].name} is typing…`;
    if (typingUsers.length === 2) return `${typingUsers[0].name} and ${typingUsers[1].name} are typing…`;
    return "Several people are typing…";
  }

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
          <span className="header-name">{user.displayName}</span>
          <div className="header-menu-wrapper">
            <button className="header-avatar-btn" onClick={() => setMenuOpen(!menuOpen)}>
              <div className="header-avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{getInitials(user.displayName)}</span>
                )}
              </div>
            </button>

            {menuOpen && (
              <div className="header-dropdown">
                <button
                  className="dropdown-item danger"
                  onClick={() => { setShowClearConfirm(true); setMenuOpen(false); }}
                >
                  Clear Chat
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    localStorage.removeItem("wisp-chat-clear-timestamp");
                    setClearTimestamp(null);
                    setMenuOpen(false);
                  }}
                >
                  Show all messages
                </button>
              </div>
            )}
          </div>
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

      {/* Clear Chat Confirmation Banner */}
      {showClearConfirm && (
        <div className="clear-banner local">
          <span className="clear-banner-text">
            This will clear the chat from your view only. Others won't be affected. Confirm?
          </span>
          <div className="clear-banner-actions">
            <button className="clear-banner-confirm" onClick={handleClearChat}>
              Confirm
            </button>
            <button className="clear-banner-cancel" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Message list */}
      <main className="message-list" ref={listRef} onScroll={handleScroll}>
        {visibleMessages.length === 0 && (
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

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="typing-indicator-row">
            <div className="typing-bubble">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span className="typing-label">{formatTyping()}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button className="scroll-to-bottom" onClick={scrollToBottom} title="Scroll to latest">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
          </svg>
        </button>
      )}

      {/* Input form */}
      <form className="message-form" onSubmit={handleSend}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={handleTextChange}
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
