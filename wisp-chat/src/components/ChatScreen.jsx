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
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase";
import MessageBubble from "./MessageBubble";
import "../styles/ChatScreen.css";

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
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
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
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

  // Dropdown + clear-all state
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Unread badge state
  const [unreadCount, setUnreadCount] = useState(0);

  // Local clear chat state
  const [localClearTimestamp, setLocalClearTimestamp] = useState(() => localStorage.getItem("wisp-chat-clear-timestamp"));
  const [localClearConfirm, setLocalClearConfirm] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const menuRef = useRef(null);
  const typingTimerRef = useRef(null);
  
  const isTabVisible = useRef(document.visibilityState === "visible");
  const isFirstSnapshot = useRef(true);

  // Page visibility listener
  useEffect(() => {
    function handleVisibilityChange() {
      const visible = document.visibilityState === "visible";
      isTabVisible.current = visible;
      if (visible) {
        setUnreadCount(0);
        document.title = "Wisp Chat";
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Title updater
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Wisp Chat`;
    } else {
      document.title = "Wisp Chat";
    }
  }, [unreadCount]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Subscribe to messages
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);

      // Unread count tracking (ignore initial load, only count when hidden)
      if (!isFirstSnapshot.current && !isTabVisible.current) {
        let newUnread = 0;
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" && change.doc.data().uid !== user.uid) {
            newUnread++;
          }
        });
        if (newUnread > 0) {
          setUnreadCount((prev) => prev + newUnread);
        }
      }
      isFirstSnapshot.current = false;

      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentUids = new Set(
        msgs.filter((m) => { const d = toDate(m.createdAt); return d && d > fiveMinAgo; })
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

  // Auto-scroll when near bottom
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const dist = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (dist < 120) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    setShowScrollBtn(list.scrollHeight - list.scrollTop - list.clientHeight > 200);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Typing management
  async function updateTyping(isTyping) {
    const typingRef = doc(db, "typing", user.uid);
    try {
      if (isTyping) {
        await setDoc(typingRef, { uid: user.uid, name: user.displayName, updatedAt: Date.now() });
      } else {
        await deleteDoc(typingRef);
      }
    } catch (_) { /* ignore */ }
  }

  function handleTextChange(e) {
    setText(e.target.value);
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
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) handleSend(e);
  }

  async function handleSignOut() {
    await updateTyping(false);
    try { await signOut(auth); } catch (err) { console.error(err); }
  }

  // Clear ALL messages using writeBatch
  async function handleClearAll() {
    setClearing(true);
    try {
      const snap = await getDocs(collection(db, "messages"));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      console.error("Clear error:", err);
    } finally {
      setClearing(false);
      setClearConfirm(false);
      setMenuOpen(false);
    }
  }

  // Local Clear Actions
  function handleConfirmLocalClear() {
    const now = new Date().toISOString();
    localStorage.setItem("wisp-chat-clear-timestamp", now);
    setLocalClearTimestamp(now);
    setLocalClearConfirm(false);
    setMenuOpen(false);
  }

  function handleRestoreMessages() {
    localStorage.removeItem("wisp-chat-clear-timestamp");
    setLocalClearTimestamp(null);
    setMenuOpen(false);
  }

  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      updateTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMessages = localClearTimestamp
    ? messages.filter((m) => {
        const d = toDate(m.createdAt);
        return d && d > new Date(localClearTimestamp);
      })
    : messages;

  const renderList = buildRenderList(filteredMessages);

  function formatTyping() {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return `${typingUsers[0].name} is typing…`;
    if (typingUsers.length === 2) return `${typingUsers[0].name} and ${typingUsers[1].name} are typing…`;
    return "Several people are typing…";
  }

  return (
    <div className="chat-screen">
      {/* Clear-all confirmation banner (Global) */}
      {clearConfirm && (
        <div className="clear-banner">
          <span className="clear-banner-text">
            ⚠️ This will delete ALL messages for everyone. Confirm?
          </span>
          <div className="clear-banner-actions">
            <button
              className="clear-banner-confirm"
              onClick={handleClearAll}
              disabled={clearing}
            >
              {clearing ? "Deleting…" : "Confirm"}
            </button>
            <button
              className="clear-banner-cancel"
              onClick={() => setClearConfirm(false)}
              disabled={clearing}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Local Clear confirmation banner */}
      {localClearConfirm && (
        <div className="clear-banner local">
          <span className="clear-banner-text">
            This will clear the chat from your view only. Others won't be affected. Confirm?
          </span>
          <div className="clear-banner-actions">
            <button className="clear-banner-confirm" onClick={handleConfirmLocalClear}>
              Confirm
            </button>
            <button className="clear-banner-cancel" onClick={() => setLocalClearConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
          {/* Avatar + dropdown trigger */}
          <div className="header-menu-wrapper" ref={menuRef}>
            <button
              className="header-avatar-btn"
              onClick={() => setMenuOpen((v) => !v)}
              title="Account options"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <div className="header-avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{getInitials(user.displayName)}</span>
                )}
              </div>
              <svg className="header-chevron" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <div className="header-dropdown">
                <div className="dropdown-user-info">
                  <span className="dropdown-name">{user.displayName}</span>
                  <span className="dropdown-email">{user.email}</span>
                </div>
                <div className="dropdown-divider" />
                <button
                  className="dropdown-item"
                  onClick={() => { setLocalClearConfirm(true); setMenuOpen(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                  Clear Chat (Local)
                </button>
                {localClearTimestamp && (
                  <button className="dropdown-item" onClick={handleRestoreMessages}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Show all messages
                  </button>
                )}
                <button
                  className="dropdown-item danger"
                  onClick={() => { setClearConfirm(true); setMenuOpen(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" /><path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Clear all messages
                </button>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={handleSignOut}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>

          <span className="header-name">{user.displayName}</span>
        </div>
      </header>

      {/* Message list */}
      <main className="message-list" ref={listRef} onScroll={handleScroll}>
        {filteredMessages.length === 0 && (
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

      {/* Scroll-to-bottom */}
      {showScrollBtn && (
        <button className="scroll-to-bottom" onClick={scrollToBottom} title="Scroll to latest">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
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
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
