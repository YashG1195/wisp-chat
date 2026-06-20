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
import { db } from "./firebase";
import "./App.css";

const NAME_KEY = "wisp-chat-username";

function App() {
  const [username, setUsername] = useState(
    () => localStorage.getItem(NAME_KEY) || ""
  );
  const [nameInput, setNameInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  // Subscribe to messages in real time
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, []);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSetName(e) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    localStorage.setItem(NAME_KEY, trimmed);
    setUsername(trimmed);
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    await addDoc(collection(db, "messages"), {
      text: trimmed,
      sender: username,
      createdAt: serverTimestamp(),
    });
    setText("");
  }

  function formatTime(ts) {
    if (!ts) return "";
    const date = ts instanceof Timestamp ? ts.toDate() : new Date();
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (!username) {
    return (
      <div className="name-screen">
        <form className="name-card" onSubmit={handleSetName}>
          <h1>Wisp Chat</h1>
          <p>Pick a display name to join the conversation.</p>
          <input
            autoFocus
            type="text"
            placeholder="Your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={24}
          />
          <button type="submit">Join Chat</button>
        </form>
      </div>
    );
  }

  return (
    <div className="chat-screen">
      <header className="chat-header">
        <h1>Wisp Chat</h1>
        <span className="chat-user">
          You're <strong>{username}</strong>
        </span>
      </header>

      <main className="message-list">
        {messages.map((msg) => {
          const isMine = msg.sender === username;
          return (
            <div
              key={msg.id}
              className={`message-row ${isMine ? "mine" : "theirs"}`}
            >
              <div className="message-bubble">
                {!isMine && <div className="message-sender">{msg.sender}</div>}
                <div className="message-text">{msg.text}</div>
                <div className="message-time">{formatTime(msg.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      <form className="message-form" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;
