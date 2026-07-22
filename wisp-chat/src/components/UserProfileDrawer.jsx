import { useState, useEffect, useRef } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../firebase";
import "../styles/UserProfileDrawer.css";

export default function UserProfileDrawer({ userId, currentUid, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Edit state (only used if userId === currentUid)
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Avatar upload state
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const isMe = userId === currentUid;

  useEffect(() => {
    async function fetchProfile() {
      if (!userId) return;
      setLoading(true);
      try {
        const userRef = doc(db, "users", userId);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data);
          if (isMe) {
            setDisplayName(data.displayName || "");
            setBio(data.bio || "");
          }
        } else if (isMe && auth.currentUser) {
          // Fallback if document doesn't exist yet for some reason
          const fallbackData = {
            displayName: auth.currentUser.displayName,
            photoURL: auth.currentUser.photoURL,
            bio: ""
          };
          setProfile(fallbackData);
          setDisplayName(fallbackData.displayName || "");
          setBio("");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [userId, isMe]);

  const hasChanges = isMe && profile && (
    displayName.trim() !== (profile.displayName || "") ||
    bio.trim() !== (profile.bio || "")
  );

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    
    try {
      const trimmedName = displayName.trim();
      const trimmedBio = bio.trim();
      
      // Update Firestore document
      await updateDoc(doc(db, "users", currentUid), {
        displayName: trimmedName,
        bio: trimmedBio,
        updatedAt: serverTimestamp()
      });

      // Update Auth profile (for backwards compatibility/easy access)
      if (auth.currentUser && trimmedName !== auth.currentUser.displayName) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      }

      setProfile(prev => ({ ...prev, displayName: trimmedName, bio: trimmedBio }));
    } catch (err) {
      console.error("Error saving profile:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setUploadError("Image must be smaller than 3MB.");
      return;
    }

    setUploadError(null);
    setUploadProgress(0);

    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const storageRef = ref(storage, `avatars/${currentUid}/${fileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setUploadProgress(pct);
      },
      (err) => {
        console.error("Avatar upload error:", err);
        setUploadError("Upload failed.");
        setUploadProgress(null);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // Update Firestore
          await updateDoc(doc(db, "users", currentUid), {
            photoURL: downloadURL,
            updatedAt: serverTimestamp()
          });

          // Update Auth Profile
          if (auth.currentUser) {
            await updateProfile(auth.currentUser, { photoURL: downloadURL });
          }

          setProfile(prev => ({ ...prev, photoURL: downloadURL }));
        } catch (err) {
          console.error("Error updating avatar URL:", err);
          setUploadError("Failed to update profile.");
        } finally {
          setUploadProgress(null);
        }
      }
    );
  }

  function getInitials(name) {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  }

  function handleSignOut() {
    auth.signOut();
  }

  if (!userId) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="profile-backdrop" onClick={onClose} />
      
      {/* Drawer */}
      <div className="profile-drawer">
        <div className="profile-drawer-header">
          <h2>{isMe ? "My Profile" : "Profile"}</h2>
          <button className="profile-close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="profile-loading">
            <span className="profile-loading-bolt">⚡</span>
          </div>
        ) : profile ? (
          <div className="profile-content">
            
            {/* Avatar Section */}
            <div className="profile-avatar-section">
              <div 
                className={`profile-large-avatar ${isMe ? "editable" : ""}`}
                onClick={() => isMe && fileInputRef.current?.click()}
              >
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt={profile.displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span className="profile-initials">{getInitials(profile.displayName)}</span>
                )}

                {/* Edit overlay */}
                {isMe && (
                  <div className="profile-avatar-overlay">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </div>
                )}

                {/* Progress indicator */}
                {uploadProgress !== null && (
                  <div className="profile-upload-progress">
                    <svg className="progress-ring" viewBox="0 0 36 36">
                      <path
                        className="progress-ring-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="progress-ring-fill"
                        strokeDasharray={`${uploadProgress}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Hidden file input for avatar */}
              {isMe && (
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="image/*" 
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              )}

              {uploadError && <div className="profile-error">{uploadError}</div>}
            </div>

            {/* User Info Fields */}
            {isMe ? (
              <div className="profile-edit-form">
                <div className="profile-field">
                  <label>Display Name</label>
                  <input 
                    type="text" 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={24}
                  />
                </div>
                
                <div className="profile-field">
                  <label>
                    Bio
                    <span className="bio-count">{150 - bio.length}</span>
                  </label>
                  <textarea 
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={150}
                    rows={3}
                    placeholder="Tell us about yourself..."
                  />
                </div>

                <button 
                  className="profile-save-btn" 
                  onClick={handleSave}
                  disabled={!hasChanges || saving || displayName.trim().length === 0}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            ) : (
              <div className="profile-view">
                <h3 className="profile-view-name">{profile.displayName}</h3>
                {profile.bio && <p className="profile-view-bio">{profile.bio}</p>}
                
                <button className="profile-dm-btn" disabled>
                  Send DM (Coming soon)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="profile-error-state">
            <p>Profile not found.</p>
          </div>
        )}

        {/* Sign Out (Only for me) */}
        {isMe && (
          <div className="profile-footer">
            <button className="profile-signout-btn" onClick={handleSignOut}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
