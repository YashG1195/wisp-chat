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

  // Clear chat state
  const [clearTimestamp, setClearTimestamp] = useState(() => {
    return localStorage.getItem("wisp-chat-clear-timestamp") || null;
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [showClearBanner, setShowClearBanner] = useState(false);

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

  function handleClearConfirm() {
    const ts = new Date().toISOString();
    localStorage.setItem("wisp-chat-clear-timestamp", ts);
    setClearTimestamp(ts);
    setShowClearBanner(false);
  }

  function handleRestoreAll() {
    localStorage.removeItem("wisp-chat-clear-timestamp");
    setClearTimestamp(null);
    setShowDropdown(false);
  }

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      updateTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleMessages = messages.filter((m) => {
    if (!clearTimestamp) return true;
    const msgDate = toDate(m.createdAt);
    if (!msgDate) return true; // keep newly sent messages
    return msgDate > new Date(clearTimestamp);
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
          <div className="header-menu-wrapper">
            <button 
              className="header-avatar-btn" 
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <div className="header-avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{getInitials(user.displayName)}</span>
                )}
              </div>
              <svg className="header-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {showDropdown && (
              <div className="header-dropdown">
                <div className="dropdown-user-info">
                  <span className="dropdown-name">{user.displayName}</span>
                </div>
                <hr className="dropdown-divider" />
                <button 
                  className="dropdown-item danger"
                  onClick={() => {
                    setShowClearBanner(true);
                    setShowDropdown(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
                    <line x1="18" y1="9" x2="12" y2="15"></line>
                    <line x1="12" y1="9" x2="18" y2="15"></line>
                  </svg>
                  Clear Chat
                </button>
                {clearTimestamp && (
                  <button 
                    className="dropdown-item"
                    onClick={handleRestoreAll}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"></polyline>
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    Show all messages
                  </button>
                )}
              </div>
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

      {/* Clear Chat Confirmation Banner */}
      {showClearBanner && (
        <div className="clear-banner">
          <span className="clear-banner-text">
            This will clear the chat from your view only. Others won't be affected. Confirm?
          </span>
          <div className="clear-banner-actions">
            <button className="clear-banner-confirm" onClick={handleClearConfirm}>
              Confirm
            </button>
            <button className="clear-banner-cancel" onClick={() => setShowClearBanner(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Message list */}
      <main className="message-list" ref={listRef} onScroll={handleScroll}>
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
