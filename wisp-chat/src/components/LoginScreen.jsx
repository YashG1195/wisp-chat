import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import "../styles/LoginScreen.css";

export default function LoginScreen() {
  async function handleGoogleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Sign-in error:", err);
    }
  }

  return (
    <div className="login-bg">
      {/* Center content */}
      <div className="login-center">
        {/* Frosted glass bolt circle */}
        <div className="login-bolt-circle">
          <svg className="login-bolt-icon" viewBox="0 0 24 24" fill="white">
            <path d="M13 2L4.5 13.5H11L10 22L20 10H13.5L13 2Z" />
          </svg>
        </div>

        <p className="login-welcome">Welcome to</p>
        <h1 className="login-title">Wisp Chat ⚡</h1>
        <p className="login-tagline">Connect instantly with friends and family</p>
      </div>

      {/* Bottom section: button + footer */}
      <div className="login-bottom">
        <button className="google-pill-btn" onClick={handleGoogleSignIn}>
          <svg className="google-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
          Continue with Google
        </button>
        <p className="login-footer">
          By continuing, you agree to our{" "}
          <span className="login-link">Terms of Service</span>
          {" "}and{" "}
          <span className="login-link">Privacy Policy</span>
        </p>
      </div>
    </div>
  );
}
