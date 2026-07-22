import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import LoginScreen from "./components/LoginScreen";
import ChatScreen from "./components/ChatScreen";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Check if user document exists, create if not
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              bio: "",
              updatedAt: serverTimestamp()
            });
          }
        } catch (err) {
          console.error("Error setting up user profile:", err);
        }
      }
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <span className="loading-bolt">⚡</span>
      </div>
    );
  }

  return user ? <ChatScreen user={user} /> : <LoginScreen />;
}

export default App;
