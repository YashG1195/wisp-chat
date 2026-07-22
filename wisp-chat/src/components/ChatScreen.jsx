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
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { signOut } from "firebase/auth";
import { db, auth, storage } from "../firebase";
import MessageBubble from "./MessageBubble";
import "../styles/ChatScreen.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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

  // Clear chat state
  const [clearTimestamp, setClearTimestamp] = useState(() => {
    return localStorage.getItem("wisp-chat-clear-timestamp") || null;
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [showClearBanner, setShowClearBanner] = useState(false);

  // Image upload state
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Subscribe to messages in real time
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);

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

  // Auto-scroll only when near bottom
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const distFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingUsers]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    setShowScrollBtn(list.scrollHeight - list.scrollTop - list.clientHeight > 200);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

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
    try { await signOut(auth); } catch (err) { console.error("Sign-out error:", err); }
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

  // --- Image upload ---
  function validateFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Only JPEG, PNG, GIF, and WebP images are allowed.");
      return false;
    }
    if (file.size > MAX_SIZE) {
      setUploadError("Image exceeds 5MB limit. Please choose a smaller file.");
      return false;
    }
    setUploadError(null);
    return true;
  }

  async function uploadImage(file, caption) {
    if (!validateFile(file)) return;

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `images/${user.uid}/${timestamp}_${safeName}`;
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setSending(true);
    setUploadProgress(0);

    uploadTask.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setUploadProgress(pct);
      },
      (err) => {
        console.error("Upload error:", err);
        setUploadError("Upload failed. Please try again.");
        setUploadProgress(null);
        setSending(false);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await addDoc(collection(db, "messages"), {
            text: caption.trim(),
            imageUrl: downloadURL,
            sender: user.displayName,
            uid: user.uid,
            photoURL: user.photoURL || null,
            createdAt: serverTimestamp(),
          });
          setText("");
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } catch (err) {
          console.error("Post-upload error:", err);
          setUploadError("Failed to send image message.");
        } finally {
          setUploadProgress(null);
          setSending(false);
        }
      }
    );
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) uploadImage(file, text);
    e.target.value = ""; // reset input
  }

  // Drag and drop handlers
  function handleDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }
  function handleDragLeave(e) {
    // Only clear if leaving the chat-screen entirely
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
  }
  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file, text);
  }

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      updateTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply clear timestamp filter
  const clearFiltered = messages.filter((m) => {
    if (!clearTimestamp) return true;
    const msgDate = toDate(m.createdAt);
    if (!msgDate) return true;
    return msgDate > new Date(clearTimestamp);
  });

  // Apply search filter (client-side, case-insensitive, text + sender)
  const trimmedSearch = searchTerm.trim().toLowerCase();
  const visibleMessages = trimmedSearch
    ? clearFiltered.filter((m) => {
        const textMatch = (m.text || "").toLowerCase().includes(trimmedSearch);
        const senderMatch = (m.sender || "").toLowerCase().includes(trimmedSearch);
        // For image-only messages, mark as [Image] for sender search
        const imgMatch = m.imageUrl && !m.text && senderMatch;
        return textMatch || senderMatch || imgMatch;
      })
    : clearFiltered;

  const renderList = buildRenderList(visibleMessages);

  function openSearch() {
    setIsSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }

  function closeSearch() {
    setIsSearchOpen(false);
    setSearchTerm("");
  }

  function formatTyping() {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return `${typingUsers[0].name} is typing…`;
    if (typingUsers.length === 2) return `${typingUsers[0].name} and ${typingUsers[1].name} are typing…`;
    return "Several people are typing…";
  }

  return (
    <div
      className={`chat-screen${isDragOver ? " drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className="dropzone-overlay">
          <div className="dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>Drop image to send</p>
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
                  onClick={() => { setShowClearBanner(true); setShowDropdown(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
                    <line x1="18" y1="9" x2="12" y2="15"></line>
                    <line x1="12" y1="9" x2="18" y2="15"></line>
                  </svg>
                  Clear Chat
                </button>
                {clearTimestamp && (
                  <button className="dropdown-item" onClick={handleRestoreAll}>
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
          {/* Search icon button */}
          <button
            className={`header-icon-btn${isSearchOpen ? " active" : ""}`}
            onClick={isSearchOpen ? closeSearch : openSearch}
            title="Search messages"
            aria-label="Search messages"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
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

      {/* Search bar — slides in below header */}
      <div className={`search-bar-wrapper${isSearchOpen ? " open" : ""}`}>
        <div className="search-bar-inner">
          <svg className="search-bar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="search-bar-input"
            placeholder="Search messages or sender name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && closeSearch()}
          />
          {searchTerm && (
            <button className="search-bar-clear" onClick={() => setSearchTerm("")} title="Clear">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <button className="search-bar-close" onClick={closeSearch} title="Close search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <p className="search-bar-note">Searching in current session only</p>
      </div>
      {showClearBanner && (
        <div className="clear-banner">
          <span className="clear-banner-text">
            This will clear the chat from your view only. Others won't be affected. Confirm?
          </span>
          <div className="clear-banner-actions">
            <button className="clear-banner-confirm" onClick={handleClearConfirm}>Confirm</button>
            <button className="clear-banner-cancel" onClick={() => setShowClearBanner(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search results count */}
      {isSearchOpen && trimmedSearch && (
        <div className="search-result-count">
          {visibleMessages.length === 0
            ? "No messages match your search"
            : `${visibleMessages.length} message${visibleMessages.length !== 1 ? "s" : ""} found`}
        </div>
      )}

      {/* Message list */}
      <main className="message-list" ref={listRef} onScroll={handleScroll}>
        {visibleMessages.length === 0 && (
          <div className="empty-state">
            {isSearchOpen && trimmedSearch ? (
              <>
                <svg className="empty-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="8" y1="11" x2="14" y2="11" strokeWidth="1.5"/>
                </svg>
                <p>No messages match your search</p>
              </>
            ) : (
              <>
                <span className="empty-bolt">⚡</span>
                <p>No messages yet. Say hello!</p>
              </>
            )}
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
              searchTerm={trimmedSearch}
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

      {/* Input form — disabled while searching */}
      <form
        className={`message-form${isSearchOpen ? " form-disabled" : ""}`}
        onSubmit={handleSend}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileInputChange}
        />

        {/* Attach button */}
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || isSearchOpen}
          title="Send image"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>

        <div className="input-wrapper">
          <input
            ref={inputRef}
            type="text"
            placeholder={isSearchOpen ? "Search mode active — close search to type" : uploadProgress !== null ? "Uploading…" : "Type a message or drop an image…"}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            maxLength={500}
            autoComplete="off"
            disabled={uploadProgress !== null || isSearchOpen}
          />
          {/* Upload progress bar */}
          {uploadProgress !== null && (
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          {/* Upload error */}
          {uploadError && (
            <div className="upload-error">
              ⚠️ {uploadError}
              <button onClick={() => setUploadError(null)}>✕</button>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!text.trim() || sending || isSearchOpen}
          className="send-btn"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  );
}
