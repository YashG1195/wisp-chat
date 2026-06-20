// Firebase initialization for Wisp Chat
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBjP0M73KVBaCOn7kTRYXwjmvmh6jeUjS4",
  authDomain: "wisp-chat-4db68.firebaseapp.com",
  projectId: "wisp-chat-4db68",
  storageBucket: "wisp-chat-4db68.firebasestorage.app",
  messagingSenderId: "761847310988",
  appId: "1:761847310988:web:40ab07c9c45363c330e9a9",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
