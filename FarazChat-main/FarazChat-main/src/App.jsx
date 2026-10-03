import { searchUserByCode, getMyProfile, updateUserProfile } from './lib/users';
import { registerUser, loginUser, logoutUser, changeUserPassword, onAuthChange, isCodeAvailable } from './lib/auth';
import { subscribeToConversations } from './lib/conversations';
import { markMessagesAsRead, sendTextMessage, subscribeToMessages } from './lib/messages';
import {
  addGroupMember as addFirestoreGroupMember,
  createGroup,
  getGroupMembers,
  leaveGroup as leaveFirestoreGroup,
  removeGroupMember as removeFirestoreGroupMember,
  subscribeToGroups,
  updateGroupDetails as updateFirestoreGroupDetails,
} from './lib/groups';
import { saveContact as saveFirestoreContact, subscribeToContacts } from './lib/contacts';
import {
  addStatusComment,
  deleteStatus as deleteFirestoreStatus,
  getStatusInteractions,
  markStatusViewed,
  publishStatus as publishFirestoreStatus,
  removeStatusComment,
  subscribeToStatuses,
  toggleStatusLike,
} from './lib/statuses';
import { subscribeToOnlineUsers, updateLastSeen } from './lib/presence';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Bell, Camera, Check, CheckCheck, Download, Eye, FileText, Heart, ImagePlus, KeyRound, LockKeyhole,
  LogOut, MessageCircle, Mic, Moon, Paperclip, Pause, Play, Plus, Search, Send, Settings, Shield, ShieldCheck,
  Smile, UserRound, UsersRound, X,
} from 'lucide-react';

const CHAT_WALLPAPER_KEY = 'farazchat-chat-wallpaper';
const APP_THEME_KEY = 'farazchat-app-theme';

function compressWallpaper(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      try {
        const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not process that image.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.76));
      } catch {
        reject(new Error('Could not process that image.'));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('Could not open that image.'));
    };
    image.src = sourceUrl;
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      try {
        const scale = Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not process that image.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('Could not open that image.'));
    };
    image.src = sourceUrl;
  });
}

function relativeTime(date) {
  if (!date) return '';
  const parsed = date?.toDate ? date.toDate() : new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  const now = new Date();
  if (parsed.toDateString() === now.toDateString()) {
    return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ name = '?', src = '', large = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [src]);
  const imageUrl = src && !/^(https?:|blob:|data:)/.test(src) ? `data:image/jpeg;base64,${src}` : src;
  return <div className={`avatar${large ? ' avatar-large' : ''}`} aria-hidden="true">{imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : name.slice(0, 1).toUpperCase()}</div>;
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function compactWaveform(samples, barCount = 48) {
  if (!samples.length) return Array.from({ length: barCount }, () => 0.08);
  return Array.from({ length: barCount }, (_unused, index) => {
    const start = Math.floor(index * samples.length / barCount);
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / barCount));
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < Math.min(end, samples.length); sampleIndex += 1) {
      peak = Math.max(peak, samples[sampleIndex]);
    }
    return Math.round(Math.max(0.08, Math.min(1, peak)) * 1000) / 1000;
  });
}

function VoiceNotePlayer({ src, waveform = [] }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = waveform.length >= 8
    ? waveform
    : Array.from({ length: 48 }, (_unused, index) => 0.18 + ((index * 37 + 11) % 24) / 30);
  const progress = duration ? currentTime / duration : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('play', play);
    audio.addEventListener('pause', pause);
    audio.addEventListener('ended', pause);
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('play', play);
      audio.removeEventListener('pause', pause);
      audio.removeEventListener('ended', pause);
    };
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  }

  function seek(event) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * duration;
  }

  return (
    <div className="voice-note-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button className="voice-play-button" type="button" onClick={togglePlayback} aria-label={playing ? 'Pause voice note' : 'Play voice note'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      <div className="voice-note-track">
        <button className="voice-waveform" type="button" onClick={seek} aria-label="Seek voice note" title="Seek voice note">
          {bars.map((amplitude, index) => <i key={index} className={index / bars.length < progress ? 'is-played' : ''} style={{ height: `${Math.round(20 + amplitude * 80)}%` }} />)}
        </button>
        <span>{formatAudioTime(currentTime || duration)}</span>
      </div>
    </div>
  );
}

function AttachmentCard() {
  return <div className="attachment-unavailable">Attachments are not supported yet.</div>;
}

function ContactProfileModal({ person, online, savedName, onClose, onSaveContact }) {
  const [nickname, setNickname] = useState(savedName || person.saved_as || person.display_name || person.username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function saveContact(event) {
    event.preventDefault();
    const value = nickname.trim();
    if (!value) {
      setError('Enter a name to save this contact.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSaveContact(person, value);
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="contact-profile-modal" role="dialog" aria-modal="true" aria-label={`${person.profile_name || person.display_name || person.username} profile`}>
        <button className="icon-button contact-profile-close" onClick={onClose} aria-label="Close profile"><X size={19} /></button>
        <Avatar name={person.profile_name || person.display_name || person.username} src={person.avatar_url} large />
        <h2>{person.profile_name || person.display_name || person.username}</h2>
        <span className="contact-profile-username">#{person.contact_code || person.username}</span>
        <span className={`contact-profile-status${online ? ' contact-is-online' : ''}`}><i />{online ? 'Online' : 'Offline'}</span>
        <p>{person.bio || 'No bio yet.'}</p>
        <form className="save-contact-form" onSubmit={saveContact}><label htmlFor="saved-contact-name">Save this contact as</label><input id="saved-contact-name" className="profile-input" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} required /><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : savedName ? 'Update saved name' : 'Save contact'}</button>{error && <span className="form-error" role="alert">{error}</span>}</form>
      </section>
    </div>
  );
}

function AuthScreen({ onLogin }) {
  const [screen, setScreen] = useState('welcome');
  const [registerStep, setRegisterStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [contactCode, setContactCode] = useState('');
  const [bio, setBio] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeAvailability, setCodeAvailability] = useState('');
  
  useEffect(() => {
  if (screen !== 'register' || registerStep !== 1 || !/^\d{8}$/.test(contactCode)) {
    setCodeAvailability('');
    return undefined;
  }
  let active = true;
  setCodeAvailability('checking');
  const timer = setTimeout(async () => {
    const available = await isCodeAvailable(contactCode);
    if (active) setCodeAvailability(available ? 'available' : 'taken');
  }, 400);
  return () => {
    active = false;
    clearTimeout(timer);
  };
}, [screen, registerStep, contactCode]);

  useEffect(() => {
    if (!photoPreview.startsWith('blob:')) return undefined;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP photo under 2 MB.');
      event.target.value = '';
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
  }

  async function continueRegistration() {
    setError('');
    if (registerStep === 1 && !/^\d{8}$/.test(contactCode)) {
      setError('Enter a valid 8-digit code.');
      return;
    }
    if (registerStep === 1) {
  if (codeAvailability === 'taken') {
    setError('This code is already taken. Choose another.');
    return;
  }
  if (codeAvailability !== 'available') {
    setError('Please wait for the code check to finish.');
    return;
  }
  setRegisterStep(2);
  return;
}
    if (registerStep === 2) {
      if (password.length < 8 || password.length > 72) {
        setError('Password must be between 8 and 72 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Your passwords do not match.');
        return;
      }
    }
    if (registerStep === 3 && !displayName.trim()) {
      setError('Enter your profile name to continue.');
      return;
    }
    setRegisterStep((step) => Math.min(step + 1, 4));
  }

  async function submit(event) {
    event.preventDefault();
    if (screen === 'register' && !policiesAccepted) return setError('Please accept the account policies to finish registration.');
    setError('');
    setBusy(true);
    try {
      const isRegister = screen === 'register';
      let result;

      if (isRegister) {
        const newUser = await registerUser({
          contactCode,
          password,
          displayName,
          bio,
        });
        if (photoFile) {
          const avatarBase64 = await compressImage(photoFile);
          result = { user: await updateUserProfile(newUser.id, { avatarBase64 }) };
        } else {
          result = { user: await getMyProfile(newUser.id) };
        }
      } else {
        const loggedInUser = await loginUser({
          contactCode,
          password,
        });
        result = { user: loggedInUser };
      }

      onLogin(result);
    } catch (requestError) {
      let message = requestError.message || 'Something went wrong.';
      if (message.includes('email-already-in-use')) {
        message = 'This code is already taken. Choose another.';
      } else if (message.includes('invalid-credential') || message.includes('wrong-password')) {
        message = 'Incorrect code or password.';
      } else if (message.includes('user-not-found')) {
        message = 'No account found with that code.';
      } else if (message.includes('weak-password')) {
        message = 'Password is too weak. Use at least 8 characters.';
      } else if (message.includes('network-request-failed')) {
        message = 'Network error. Check your internet connection.';
      } else if (message.includes('invalid-email')) {
        message = 'Enter a valid 8-digit code.';
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-topline">
        <a className="brand" href="#">
          <img className="brand-mark-image" src="/farazchat-mark.svg" alt="" />
          <span>Faraz<span className="brand-light">Chat</span></span>
        </a>
        <span className="private-note"><LockKeyhole size={13} /> PRIVATE MESSAGING</span>
      </div>
      <section className="auth-content">
        <div className="auth-copy">
          <div className="eyebrow"><span className="live-dot" /> YOUR PEOPLE, RIGHT HERE</div>
          <h1>Good conversations<br />start with <span>hello.</span></h1>
          <p>A quieter place for the people you want to keep close. Find them by their 8-digit contact code and pick up the conversation.</p>
          <div className="auth-footnote"><ShieldCheck size={17} /><span>Accounts and messages stay on your FarazChat server.</span></div>
        </div>
        <div className="auth-form-wrap">
          {screen === 'welcome' && (
            <div className="auth-choice-screen">
              <span className="form-icon"><MessageCircle size={19} /></span>
              <h2>Welcome to FarazChat</h2>
              <p>Choose how you want to continue.</p>
              <button className="primary-button" onClick={() => setScreen('register')}>Create account <span>→</span></button>
              <button className="secondary-button" onClick={() => setScreen('login')}>Log in <span>→</span></button>
            </div>
          )}

          {screen === 'login' && <>
            <div className="auth-form-heading">
              <span className="form-icon"><LockKeyhole size={19} /></span>
              <div><h2>Log in</h2><p>Enter your 8-digit contact code and password.</p></div>
            </div>
            <form className="auth-form" onSubmit={submit}>
              <label htmlFor="login-code">8-digit contact code</label>
              <div className="field-with-icon">
                <UserRound size={17} />
                <input id="login-code" autoComplete="username" value={contactCode} onChange={(event) => setContactCode(event.target.value.trim().slice(0, 24))} placeholder="8-digit contact code" maxLength={24} required />
              </div>
              <label htmlFor="login-password">Password</label>
              <div className="field-with-icon">
                <LockKeyhole size={17} />
                <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" required />
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}<span>→</span></button>
            </form>
            <button className="auth-back-button" onClick={() => { setScreen('welcome'); setError(''); }}>← Back</button>
          </>}

          {screen === 'register' && <>
            <div className="register-progress">
              <span>STEP {registerStep} OF 4</span>
              <div><i style={{ width: `${registerStep * 25}%` }} /></div>
              <button onClick={() => { setScreen('welcome'); setRegisterStep(1); setError(''); }}>Cancel</button>
            </div>
            <form className="auth-form register-step-form" onSubmit={registerStep === 4 ? submit : (event) => { event.preventDefault(); continueRegistration(); }}>
              {registerStep === 1 && <>
                <div className="auth-form-heading">
                  <span className="form-icon"><UserRound size={19} /></span>
                  <div><h2>Choose your code</h2><p>People will use this unique code to find you.</p></div>
                </div>
                <label htmlFor="register-code">8-digit contact code</label>
                <div className="field-with-icon">
                  <span className="code-prefix">#</span>
                  <input id="register-code" inputMode="numeric" autoComplete="off" value={contactCode} onChange={(event) => { const nextCode = event.target.value.replace(/\D/g, '').slice(0, 8); setContactCode(nextCode); setError(''); setCodeAvailability(''); }} placeholder="8 numbers" pattern="[0-9]{8}" minLength={8} maxLength={8} disabled={busy} required />
                </div>
                <p className={`code-availability${codeAvailability ? ` code-availability-${codeAvailability}` : ''}`} role={codeAvailability === 'taken' ? 'alert' : 'status'} aria-live="polite">
                  {codeAvailability === 'checking' ? 'Checking code…' : codeAvailability === 'available' ? 'This code is available.' : codeAvailability === 'taken' ? 'This code is already in use. Choose another.' : 'Use this code to log in and let friends find you.'}
                </p>
              </>}
              {registerStep === 2 && <>
                <div className="auth-form-heading">
                  <span className="form-icon"><LockKeyhole size={19} /></span>
                  <div><h2>Secure your account</h2><p>Choose a password and confirm it.</p></div>
                </div>
                <label htmlFor="register-password">Password</label>
                <div className="field-with-icon">
                  <LockKeyhole size={17} />
                  <input id="register-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} maxLength={72} required />
                </div>
                <label htmlFor="register-password-confirm">Confirm password</label>
                <div className="field-with-icon">
                  <LockKeyhole size={17} />
                  <input id="register-password-confirm" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Enter it again" minLength={8} maxLength={72} required />
                </div>
              </>}
              {registerStep === 3 && <>
                <div className="auth-form-heading">
                  <span className="form-icon"><Camera size={19} /></span>
                  <div><h2>Make it yours</h2><p>Add your name and a profile photo.</p></div>
                </div>
                <div className="signup-photo-row">
                  <Avatar name={displayName || contactCode} src={photoPreview} large />
                  <label className="photo-pick-button"><Camera size={15} /> Add profile photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /></label>
                  <span>Optional · up to 2 MB</span>
                </div>
                <label htmlFor="display-name">Your name</label>
                <div className="field-with-icon">
                  <UserRound size={17} />
                  <input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="Your name" maxLength={40} required />
                </div>
              </>}
              {registerStep === 4 && <>
                <div className="auth-form-heading">
                  <span className="form-icon"><ShieldCheck size={19} /></span>
                  <div><h2>One last thing</h2><p>Add a short bio and review the policies.</p></div>
                </div>
                <label htmlFor="register-bio">Bio <span className="optional-label">OPTIONAL</span></label>
                <textarea className="profile-textarea signup-bio" id="register-bio" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="A little about you" maxLength={160} />
                <div className="account-policies">
                  <strong>Before you join</strong>
                  <ul>
                    <li>Your password cannot be recovered. Keep it somewhere safe.</li>
                    <li>Your 8-digit code is how other members find you.</li>
                    <li>Messages and files are stored on this app's server, not end-to-end encrypted.</li>
                    <li>Status updates disappear after 24 hours. Use privacy settings to control search visibility.</li>
                  </ul>
                </div>
                <label className="policy-consent">
                  <input type="checkbox" checked={policiesAccepted} onChange={(event) => setPoliciesAccepted(event.target.checked)} />
                  <span>I understand and agree to these account policies.</span>
                </label>
              </>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="register-step-actions">
                {registerStep > 1 && <button type="button" className="secondary-button" onClick={() => { setError(''); setRegisterStep((step) => step - 1); }}>Back</button>}
                <button type="submit" className="primary-button auth-submit" disabled={busy || (registerStep === 4 && !policiesAccepted) || (registerStep === 1 && codeAvailability !== 'available')} >
                  {busy ? (registerStep === 1 ? 'Checking…' : 'Creating…') : (registerStep === 4 ? 'Create account' : 'Continue')}
                  <span>→</span>
                </button>
              </div>
            </form>
          </>}

          {screen !== 'welcome' && (
            <p className="auth-mode-switch">
              {screen === 'login' ? 'New to FarazChat?' : 'Already registered?'}{' '}
              <button onClick={() => { setScreen(screen === 'login' ? 'register' : 'login'); setRegisterStep(1); setError(''); }}>
                {screen === 'login' ? 'Create account' : 'Log in'}
              </button>
            </p>
          )}
        </div>
      </section>
      <footer className="auth-footer">
        <span>FARAZCHAT</span>
        <span>Made for the conversations that matter.</span>
        <span>YOUR SPACE, YOUR PEOPLE</span>
      </footer>
    </main>
  );
}
function NewChatModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    let alive = true;
    if (!/^\d{8}$/.test(query.trim())) {
      setUsers([]);
      setError('');
      return () => { alive = false; };
    }
    const timer = setTimeout(async () => {
      try {
        const person = await searchUserByCode(query.trim());
        if (alive) { setUsers(person ? [person] : []); setError(''); }
      } catch (requestError) {
        if (alive) setError(requestError.message);
      }
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="new-chat-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
        <div className="modal-heading"><div><span className="modal-kicker">START A CONVERSATION</span><h2 id="new-chat-title">New chat</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <label className="search-field modal-search"><Search size={17} /><input ref={inputRef} inputMode="numeric" value={query} onChange={(event) => setQuery(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Enter full 8-digit code" maxLength={8} /></label>
        <div className="search-results" aria-live="polite">
          {!/^\d{8}$/.test(query.trim()) && <div className="search-empty"><span className="search-empty-icon"><UserRound size={21} /></span><strong>Find your people</strong><span>Enter the complete 8-digit contact code.</span></div>}
          {error && <p className="form-error search-error">{error}</p>}
          {/^\d{8}$/.test(query.trim()) && !error && users.length === 0 && <div className="search-empty"><span className="search-empty-icon"><Search size={20} /></span><strong>No account for that code</strong><span>Check all 8 digits and try again.</span></div>}
          {users.map((person) => <button className="result-user" key={person.id} onClick={() => onSelect(person)}><Avatar name={person.display_name || person.username} src={person.avatar_url} /><span className="result-user-name"><strong>{person.display_name || person.username}</strong><span>#{person.contact_code || person.username}{person.bio ? ` · ${person.bio}` : ''}</span></span><span className="result-arrow">↗</span></button>)}
        </div>
      </section>
    </div>
  );
}

function GroupModal({ user, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(() => new Map());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!/^\d{8}$/.test(query.trim())) {
      setUsers([]);
      return () => { alive = false; };
    }
    const timer = setTimeout(async () => {
      try {
        const person = await searchUserByCode(query.trim());
        if (alive) { setUsers(person ? [person] : []); setError(''); }
      } catch (requestError) {
        if (alive) setError(requestError.message);
      }
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  function toggleMember(user) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(user.id)) next.delete(user.id);
      else if (next.size < 49) next.set(user.id, user);
      return next;
    });
  }

  async function handleCreateGroup(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const group = await createGroup({
        name,
        memberIds: [...selected.keys()],
        creator: user,
      });
      onCreate(group);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="new-chat-modal group-create-modal" role="dialog" aria-modal="true" aria-labelledby="group-title">
        <div className="modal-heading"><div><span className="modal-kicker">BRING EVERYONE TOGETHER</span><h2 id="group-title">New group</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <form className="group-create-form" onSubmit={handleCreateGroup}>
          <label htmlFor="group-name">Group name</label>
          <input className="profile-input" id="group-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekend plans" maxLength={40} required />
          <label className="search-field modal-search group-search"><Search size={17} /><input inputMode="numeric" value={query} onChange={(event) => setQuery(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Find by 8-digit code" maxLength={8} /></label>
          <div className="group-selected"><strong>{selected.size} selected</strong>{[...selected.values()].map((person) => <button key={person.id} type="button" onClick={() => toggleMember(person)}>{person.display_name || person.username}<X size={13} /></button>)}</div>
          <div className="group-user-results" aria-live="polite">
            {!/^\d{8}$/.test(query.trim()) && <span className="group-search-hint">Enter the complete 8-digit code to add someone.</span>}
            {users.map((person) => <button type="button" key={person.id} className={`group-user-result${selected.has(person.id) ? ' is-selected' : ''}`} onClick={() => toggleMember(person)}><Avatar name={person.display_name || person.username} src={person.avatar_url} /><span><strong>{person.display_name || person.username}</strong><small>#{person.contact_code || person.username}</small></span><span className="member-check">{selected.has(person.id) ? '✓' : '+'}</span></button>)}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button group-create-submit" disabled={busy || selected.size === 0}>{busy ? 'Creating…' : `Create group${selected.size ? ` · ${selected.size + 1} members` : ''}`}</button>
        </form>
      </section>
    </div>
  );
}

function StatusComposerModal({ user, onClose, onPublished }) {
  const [body, setBody] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef(null);
  const emojis = ['😀', '😂', '😍', '🥰', '😎', '🎉', '❤️', '🔥', '🙏', '✨', '👍', '😊'];

  function insertEmoji(emoji) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const nextBody = `${body.slice(0, start)}${emoji}${body.slice(end)}`;
    if (nextBody.length > 700) return;
    setBody(nextBody);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!body.trim()) {
      setError('Write something before sharing your status.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await publishFirestoreStatus(user, body);
      onPublished();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="new-chat-modal status-composer-modal" role="dialog" aria-modal="true" aria-labelledby="status-composer-title">
        <div className="modal-heading"><div><span className="modal-kicker">DISAPPEARS AFTER 24 HOURS</span><h2 id="status-composer-title">Add a status</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <form className="status-composer-form" onSubmit={submit}>
          <div className="status-text-heading"><label htmlFor="status-text">Your update</label><button type="button" className="icon-button" onClick={() => setEmojiOpen((open) => !open)} aria-label="Add emoji" title="Add emoji"><Smile size={19} /></button></div>
          <textarea ref={textareaRef} id="status-text" value={body} onChange={(event) => setBody(event.target.value)} maxLength={700} placeholder="What’s happening?" aria-label="Status text" />
          {emojiOpen && <div className="status-emoji-picker" aria-label="Choose an emoji">{emojis.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} aria-label={`Insert ${emoji}`}>{emoji}</button>)}</div>}
          <div className="status-composer-actions"><span>{body.length}/700</span><button className="primary-button" disabled={busy}>{busy ? 'Sharing…' : 'Share status'}</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </section>
    </div>
  );
}

function StatusViewerModal({ user, update, onClose, onDelete, onOpenChat, initialStatusId }) {
  const [index, setIndex] = useState(() => Math.max(0, update.statuses.findIndex((item) => item.id === initialStatusId)));
  const [error, setError] = useState('');
  const [interactions, setInteractions] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);
  const status = update.statuses[index];
  const canGoBack = index > 0;
  const canGoForward = index < update.statuses.length - 1;

  useEffect(() => {
    if (!status) return undefined;
    let active = true;
    setInteractions(null);
    setCommentDraft('');
    setError('');
    (async () => {
      try {
        if (!update.own) await markStatusViewed(status.id, user.id);
        const result = await getStatusInteractions(status.id, user.id);
        if (active) setInteractions(result);
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    })();
    return () => { active = false; };
  }, [status?.id, user.id, update.own]);

  async function toggleLike() {
    if (!interactions) return;
    setSavingInteraction(true);
    setError('');
    try {
      const result = await toggleStatusLike(status.id, user.id, interactions.liked);
      setInteractions(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingInteraction(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    const body = commentDraft.trim();
    if (!body || !interactions) return;
    setSavingInteraction(true);
    setError('');
    try {
      const comment = await addStatusComment(status.id, user, body);
      setInteractions((current) => ({ ...current, comments: [...current.comments, comment] }));
      setCommentDraft('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingInteraction(false);
    }
  }

  async function deleteComment(comment) {
    try {
      await removeStatusComment(status.id, comment);
      setInteractions((current) => ({ ...current, comments: current.comments.filter((item) => item.id !== comment.id) }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteCurrentStatus() {
    try {
      await deleteFirestoreStatus(status.id);
      onDelete(status.id);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="modal-scrim status-viewer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="status-viewer" role="dialog" aria-modal="true" aria-label={`${update.user.display_name}'s status`}>
        <header><Avatar name={update.user.display_name || update.user.username} src={update.user.avatar_url} /><span><strong>{update.own ? 'My status' : update.user.display_name || update.user.username}</strong><small>{new Date(status.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></span><button className="icon-button" onClick={onClose} aria-label="Close status"><X size={19} /></button></header>
        <div className="status-progress"><i style={{ width: `${((index + 1) / update.statuses.length) * 100}%` }} /></div>
        <main>{status.body && <p>{status.body}</p>}</main>
        <section className="status-interactions" aria-label="Status interactions">
          <div className="status-reaction-row"><button className={`status-like-button${interactions?.liked ? ' is-liked' : ''}`} onClick={toggleLike} disabled={!interactions || savingInteraction} aria-pressed={Boolean(interactions?.liked)}><Heart size={17} fill={interactions?.liked ? 'currentColor' : 'none'} />{interactions?.likes_count ?? status.likes_count ?? 0}</button><span className="status-view-count"><Eye size={16} />{interactions?.views_count ?? status.views_count ?? 0} views</span></div>
          {update.own && interactions?.viewers.length > 0 && <div className="status-viewer-list"><strong>Seen by</strong>{interactions.viewers.map((viewer) => <span key={viewer.id}><Avatar name={viewer.display_name || viewer.username} src={viewer.avatar_url} />{viewer.display_name || viewer.username}</span>)}</div>}
          <div className="status-comments"><strong>Comments {interactions ? `· ${interactions.comments.length}` : ''}</strong>{interactions?.comments.map((comment) => <div className="status-comment" key={comment.id}><button className="status-comment-avatar" type="button" onClick={() => onOpenChat(comment.user)} aria-label={`Open chat with ${comment.user.display_name || comment.user.username}`} title="Open personal chat"><Avatar name={comment.user.display_name || comment.user.username} src={comment.user.avatar_url} /></button><span><b>{comment.user.display_name || comment.user.username}</b><span>{comment.body}</span></span>{(comment.user.id === update.user.id || update.own) && <button className="status-comment-delete" onClick={() => deleteComment(comment)} aria-label="Delete comment"><X size={14} /></button>}</div>)}</div>
          <form className="status-comment-form" onSubmit={submitComment}><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Reply to status…" maxLength={500} aria-label="Comment on status" disabled={!interactions || savingInteraction} /><button type="submit" disabled={!commentDraft.trim() || !interactions || savingInteraction} aria-label="Send comment"><Send size={16} /></button></form>
        </section>
        <footer>{canGoBack && <button onClick={() => setIndex(index - 1)}>Newer</button>}<span>{index + 1} / {update.statuses.length}</span>{canGoForward && <button onClick={() => setIndex(index + 1)}>Older</button>}{update.own && <button className="status-delete" onClick={deleteCurrentStatus}>Delete</button>}</footer>
        {error && <p className="form-error">{error}</p>}
      </section>
    </div>
  );
}

function StatusActivityModal({ notifications, onClose, onOpenStatus }) {
  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="contact-profile-modal status-activity-modal" role="dialog" aria-modal="true" aria-labelledby="status-activity-title">
        <header className="modal-heading"><div><span className="modal-kicker">STATUS ACTIVITY</span><h2 id="status-activity-title">Recent activity</h2></div><button className="icon-button" onClick={onClose} aria-label="Close activity"><X size={19} /></button></header>
        {notifications.length ? <div className="status-activity-list">{notifications.map((notification) => {
          const actorName = notification.actor.display_name || notification.actor.username;
          const action = notification.kind === 'view' ? 'viewed your status' : notification.kind === 'like' ? 'liked your status' : 'replied to your status';
          return <button className={`status-activity-item${notification.read_at ? '' : ' is-unread'}`} key={notification.id} onClick={() => onOpenStatus(notification.status_id)}>
            <Avatar name={actorName} src={notification.actor.avatar_url} />
            <span className="status-activity-copy"><span><strong>{actorName}</strong> {action}</span>{notification.body && <small>“{notification.body}”</small>}<time>{new Date(notification.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span>
            <span className={`status-activity-kind status-activity-${notification.kind}`}>{notification.kind === 'view' ? <Eye size={16} /> : notification.kind === 'like' ? <Heart size={16} /> : <MessageCircle size={16} />}</span>
          </button>;
        })}</div> : <div className="status-activity-empty"><Bell size={22} /><strong>All caught up</strong><span>Status views, likes, and replies will show here.</span></div>}
      </section>
    </div>
  );
}

function GroupDetailsModal({ group, currentUser, onClose, onUpdate, onAddMember, onRemoveMember, onLeave }) {
  const [members, setMembers] = useState([]);
  const [name, setName] = useState(group.name || '');
  const [bio, setBio] = useState(group.bio || '');
  const [photoPreview, setPhotoPreview] = useState(group.avatar_url || '');
  const [avatarBase64, setAvatarBase64] = useState(group.avatarBase64 || '');
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = group.createdBy === currentUser.id;

  useEffect(() => {
    let alive = true;
    getGroupMembers(group).then((result) => {
      if (alive) setMembers(result);
    }).catch((requestError) => { if (alive) setError(requestError.message); });
    return () => { alive = false; };
  }, [group.id, group.memberIds]);

  useEffect(() => {
    let alive = true;
    if (!/^\d{8}$/.test(searchCode.trim())) {
      setSearchResult(null);
      return () => { alive = false; };
    }
    const timer = setTimeout(async () => {
      try {
        const person = await searchUserByCode(searchCode.trim());
        if (alive) setSearchResult(person);
      } catch (requestError) {
        if (alive) setError(requestError.message);
      }
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [searchCode]);

  async function saveGroupProfile(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await onUpdate(group.id, { name, bio, avatarBase64 });
      setNotice('Group profile updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseGroupPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image under 2 MB.');
      return;
    }
    setError('');
    try {
      const photo = await compressImage(file);
      if (photo.length > 800_000) throw new Error('Choose a smaller group photo.');
      setAvatarBase64(photo);
      setPhotoPreview(`data:image/jpeg;base64,${photo}`);
    } catch (photoError) {
      setError(photoError.message || 'Could not process that group photo.');
    }
  }

  async function addMember() {
    if (!searchResult) return;
    setError('');
    setBusy(true);
    try {
      await onAddMember(group.id, searchResult.id);
      setSearchCode('');
      setSearchResult(null);
      setNotice(`${searchResult.display_name || searchResult.username} added to the group.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.display_name || member.username} from this group?`)) return;
    setError('');
    setBusy(true);
    try {
      await onRemoveMember(group.id, member.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function leaveThisGroup() {
    if (!window.confirm(`Leave ${group.name}?`)) return;
    setError('');
    setBusy(true);
    try {
      await onLeave(group.id);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="contact-profile-modal group-details-modal" role="dialog" aria-modal="true" aria-label={`${group.name} group details`}>
        <button className="icon-button contact-profile-close" onClick={onClose} aria-label="Close group details"><X size={19} /></button>
        <div className="group-details-profile"><Avatar name={group.name} src={photoPreview} large /><h2>{group.name}</h2><span className="contact-profile-username">{members.length || group.member_count} members</span><p>{group.bio || 'No group bio yet.'}</p></div>
        {canManage && <form className="group-profile-form" onSubmit={saveGroupProfile}>
          <label className="group-photo-picker"><Camera size={15} /> Change group photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseGroupPhoto} disabled={busy} /></label>
          <label htmlFor="group-profile-name">Group name</label><input className="profile-input" id="group-profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required />
          <label htmlFor="group-profile-bio">Group bio</label><textarea className="profile-textarea" id="group-profile-bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={240} placeholder="What is this group about?" />
          <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save group profile'}</button>
        </form>}
        {canManage && <div className="group-add-member"><label htmlFor="group-member-code">Add a member by 8-digit code</label><div className="search-field group-search"><Search size={16} /><input id="group-member-code" inputMode="numeric" value={searchCode} onChange={(event) => setSearchCode(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Contact code" maxLength={8} /></div>
          {searchResult && <div className="group-user-result"><Avatar name={searchResult.display_name || searchResult.username} src={searchResult.avatar_url} /><span><strong>{searchResult.display_name || searchResult.username}</strong><small>#{searchResult.contact_code || searchResult.username}</small></span><button type="button" className="secondary-button" onClick={addMember} disabled={busy || group.memberIds?.includes(searchResult.id) || group.memberIds?.length >= 50}>{group.memberIds?.includes(searchResult.id) ? 'Added' : group.memberIds?.length >= 50 ? 'Group full' : 'Add'}</button></div>}
        </div>}
        <div className="group-member-list"><h3>Members</h3>{members.map((member) => <div key={member.id}><Avatar name={member.display_name || member.username} src={member.avatar_url} /><span><strong>{member.display_name || member.username}{member.id === currentUser.id ? ' · You' : ''}</strong><small>#{member.contact_code || member.username}{member.id === group.createdBy ? ' · creator' : ''}</small></span>{canManage && member.id !== currentUser.id && <button type="button" className="group-member-remove" onClick={() => removeMember(member)} disabled={busy} aria-label={`Remove ${member.display_name || member.username}`} title="Remove member"><X size={15} /></button>}</div>)}</div>
        <button type="button" className="group-leave-button" onClick={leaveThisGroup} disabled={busy}><LogOut size={15} /> Leave group</button>
        {notice && <p className="settings-success" role="status">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
      </section>
    </div>
  );
}

function SettingsModal({ user, initialSection, chatWallpaper, onWallpaperChange, theme, onThemeChange, onClose, onSave, onSignOut }) {
  const [section, setSection] = useState(initialSection);
  const [displayName, setDisplayName] = useState(user.display_name || user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(Boolean(user.notifications_enabled));
  const [discoverable, setDiscoverable] = useState(user.discoverable !== false);
  const [photoPreview, setPhotoPreview] = useState(user.avatar_url || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const sections = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    { id: 'privacy', label: 'Privacy', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Moon },
    { id: 'wallpaper', label: 'Chat background', icon: ImagePlus },
    { id: 'account', label: 'Account', icon: KeyRound },
  ];

  async function requestNotifications(event) {
    const enabled = event.target.checked;
    const previous = notificationsEnabled;
    setError('');
    if (enabled) {
      if (!('Notification' in window)) {
        setError('This browser does not support desktop notifications.');
        return;
      }
      try {
        const permission = Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
        if (permission !== 'granted') {
          setError('Allow notifications in your browser settings to turn this on.');
          return;
        }
      } catch {
        setError('Could not request notification permission from this browser.');
        return;
      }
    }
    setNotificationsEnabled(enabled);
    if (!(await persistSettings({ notificationsEnabled: enabled }))) setNotificationsEnabled(previous);
  }

  async function persistSettings(changes = {}, includeProfile = false) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const profile = await updateUserProfile(user.id, {
        displayName: includeProfile ? displayName : user.displayName || user.display_name || user.username,
        bio: includeProfile ? bio : user.bio || '',
        notificationsEnabled: changes.notificationsEnabled ?? notificationsEnabled,
        discoverable: changes.discoverable ?? discoverable,
      });
      onSave(profile);
      setNotice('Settings saved.');
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    await persistSettings({}, true);
  }

  async function changeDiscoverability(event) {
    const nextValue = event.target.checked;
    const previous = discoverable;
    setDiscoverable(nextValue);
    if (!(await persistSettings({ discoverable: nextValue }))) setDiscoverable(previous);
  }

  function chooseWallpaper(value) {
    try {
      localStorage.setItem(CHAT_WALLPAPER_KEY, value);
      onWallpaperChange(value);
      setNotice('Chat background updated.');
      setError('');
    } catch {
      setError('Could not save this background on the device.');
    }
  }

  function changeTheme(event) {
    const nextTheme = event.target.checked ? 'dark' : 'light';
    try {
      localStorage.setItem(APP_THEME_KEY, nextTheme);
      onThemeChange(nextTheme);
      setNotice('Theme updated.');
      setError('');
    } catch {
      setError('Could not save the theme on this device.');
    }
  }

  async function selectWallpaperFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) {
      setError('Choose an image that is 12 MB or smaller.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const imageData = await compressWallpaper(file);
      if (imageData.length > 4_000_000) throw new Error('Choose a smaller image.');
      chooseWallpaper(imageData);
    } catch (wallpaperError) {
      setError(wallpaperError.message || 'Could not save that image.');
    } finally {
      setBusy(false);
    }
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP photo under 2 MB.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const avatarBase64 = await compressImage(file);
      const profile = await updateUserProfile(user.id, { avatarBase64 });
      setPhotoPreview(profile.avatar_url);
      onSave(profile);
      setNotice('Profile photo updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await changeUserPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password changed.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function chooseSection(nextSection) {
    setSection(nextSection);
    setError('');
    setNotice('');
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header"><div><span className="modal-kicker">FARAZCHAT</span><h2 id="settings-title">Settings</h2><p>#{user.contact_code || user.username}</p></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={19} /></button></header>
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map(({ id, label, icon: Icon }) => <button key={id} className={`settings-nav-item${section === id ? ' settings-nav-active' : ''}`} onClick={() => chooseSection(id)}><Icon size={17} /><span>{label}</span></button>)}
        </nav>
        <div className="settings-content">
          <div className="settings-section-heading"><span className="modal-kicker">{sections.find((item) => item.id === section)?.label.toUpperCase()}</span><h3>{section === 'profile' ? 'Your profile' : section === 'privacy' ? 'Privacy' : section === 'notifications' ? 'Notifications' : section === 'appearance' ? 'Appearance' : section === 'wallpaper' ? 'Chat background' : 'Account security'}</h3></div>
          {section === 'profile' && <form className="settings-form" onSubmit={submit}>
            <label className="photo-picker" title="Change profile photo"><Avatar name={displayName || user.username} src={photoPreview} large /><span><Camera size={15} /> Change photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /></label>
            <div className="settings-field"><label htmlFor="edit-display-name">Profile name</label><input className="profile-input" id="edit-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required /></div>
            <div className="settings-field"><label htmlFor="edit-bio">Bio</label><textarea className="profile-textarea" id="edit-bio" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="A little about you" maxLength={160} /><span className="bio-counter">{bio.length}/160</span></div>
            <button className="primary-button settings-save" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          </form>}
          {section === 'privacy' && <div className="settings-panel"><div className="settings-row"><span className="setting-icon"><Search size={17} /></span><span className="notification-setting-copy"><strong>Find me by contact code</strong><span>{discoverable ? 'Other members can find you using your full 8-digit code.' : 'You will not appear in code search.'}</span></span><label className="switch-control" aria-label="Find me by contact code"><input type="checkbox" checked={discoverable} onChange={changeDiscoverability} disabled={busy} /><span className="switch-track" /></label></div></div>}
          {section === 'notifications' && <div className="settings-panel"><div className="settings-row"><span className="setting-icon"><Bell size={17} /></span><span className="notification-setting-copy"><strong>Desktop message notifications</strong><span>Show alerts when the app is open but the conversation is not active. Browser permission is required.</span></span><label className="switch-control" aria-label="Message notifications"><input type="checkbox" checked={notificationsEnabled} onChange={requestNotifications} disabled={busy} /><span className="switch-track" /></label></div></div>}
          {section === 'appearance' && <div className="settings-panel"><div className="settings-row"><span className="setting-icon"><Moon size={17} /></span><span className="notification-setting-copy"><strong>Dark theme</strong><span>Use the same theme across all accounts on this device.</span></span><label className="switch-control" aria-label="Dark theme"><input type="checkbox" checked={theme === 'dark'} onChange={changeTheme} /><span className="switch-track" /></label></div></div>}
          {section === 'wallpaper' && <div className="wallpaper-settings"><div className="wallpaper-choices">{[{ id: 'paper', label: 'Soft paper' }, { id: 'grid', label: 'Fine grid' }, { id: 'sage', label: 'Sage dots' }].map((wallpaper) => <button key={wallpaper.id} type="button" className={`wallpaper-choice wallpaper-choice-${wallpaper.id}${chatWallpaper === wallpaper.id ? ' is-selected' : ''}`} onClick={() => chooseWallpaper(wallpaper.id)} aria-pressed={chatWallpaper === wallpaper.id}><span className="wallpaper-swatch" /><strong>{wallpaper.label}</strong></button>)}</div><div className="wallpaper-actions"><label className="photo-pick-button" title="Choose a chat background from your gallery"><ImagePlus size={15} /> Choose from gallery<input type="file" accept="image/*" onChange={selectWallpaperFile} disabled={busy} /></label>{chatWallpaper !== 'paper' && <button className="secondary-button" type="button" onClick={() => chooseWallpaper('paper')} disabled={busy}>Reset</button>}</div></div>}
          {section === 'account' && <div className="settings-panel"><div className="account-identity"><span className="setting-icon"><UserRound size={17} /></span><span className="notification-setting-copy"><strong>#{user.contact_code || user.username}</strong><span>Your contact code is how others find you.</span></span></div><form className="settings-form password-form" onSubmit={changePassword}><h4>Change password</h4><div className="settings-field"><label htmlFor="current-password">Current password</label><input className="profile-input" type="password" id="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></div><div className="settings-field"><label htmlFor="new-password">New password</label><input className="profile-input" type="password" id="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required /></div><button className="primary-button settings-save" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form>{confirmSignOut ? <div className="signout-confirm" role="alertdialog" aria-label="Confirm sign out"><strong>Sign out of this account?</strong><span>You can sign back in with your contact code and password.</span><div><button className="cancel-button" onClick={() => setConfirmSignOut(false)}>Cancel</button><button className="confirm-signout-button" onClick={onSignOut}>Sign out</button></div></div> : <button className="signout-button" onClick={() => setConfirmSignOut(true)}><LogOut size={16} /> Sign out</button>}</div>}
          {error && <p className="form-error settings-feedback" role="alert">{error}</p>}
          {notice && <p className="settings-success" role="status">{notice}</p>}
        </div>
        <span className="settings-footer">FarazChat · Version 1.0</span>
      </section>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [inboxView, setInboxView] = useState('chats');
  const [chatWallpaper, setChatWallpaper] = useState(() => localStorage.getItem(CHAT_WALLPAPER_KEY) || 'paper');
  const [theme, setTheme] = useState(() => localStorage.getItem(APP_THEME_KEY) === 'dark' ? 'dark' : 'light');
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [groupMembersById, setGroupMembersById] = useState(() => new Map());
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);
  const [activeStatus, setActiveStatus] = useState(null);
  const [activeStatusId, setActiveStatusId] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('profile');
  const [contactProfileOpen, setContactProfileOpen] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  const statusNotifications = [];
  const socketReady = Boolean(user);
  const contactTyping = false;
  const typingName = '';
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedWaveform, setSelectedWaveform] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [startingRecording, setStartingRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingWaveform, setRecordingWaveform] = useState(() => compactWaveform([]));
  const [cancelVoiceSwipe, setCancelVoiceSwipe] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState('');
  const messageEndRef = useRef(null);
  const messageStageRef = useRef(null);
  const readReceiptInFlightRef = useRef(new Set());
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingSizeRef = useRef(0);
  const recordingSamplesRef = useRef([]);
  const waveformContextRef = useRef(null);
  const waveformAnalyserRef = useRef(null);
  const waveformTimerRef = useRef(null);
  const cancelRecordingRef = useRef(false);
  const sendVoiceOnStopRef = useRef(false);
  const recordingPointerRef = useRef(null);

  useEffect(() => {
    function syncPreferences(event) {
      if (event.key === APP_THEME_KEY) {
        setTheme(event.newValue === 'dark' ? 'dark' : 'light');
      } else if (event.key === CHAT_WALLPAPER_KEY) {
        setChatWallpaper(event.newValue || 'paper');
      }
    }
    window.addEventListener('storage', syncPreferences);
    return () => window.removeEventListener('storage', syncPreferences);
  }, []);

  useEffect(() => {
    let alive = true;
    const unsubscribe = onAuthChange((firebaseUser) => {
      setLoading(true);
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      getMyProfile(firebaseUser.uid)
        .then((profile) => { if (alive) setUser(profile); })
        .catch((loadError) => { if (alive) { setUser(null); setError(loadError.message); } })
        .finally(() => { if (alive) setLoading(false); });
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const showError = (loadError) => setError(loadError.message);
    const stopConversations = subscribeToConversations(user.id, setConversations, showError);
    const stopGroups = subscribeToGroups(user.id, setGroups, showError);
    const stopContacts = subscribeToContacts(user.id, setContacts, showError);
    const stopPresence = subscribeToOnlineUsers(setOnlineUsers, showError);
    updateLastSeen(user.id).catch(showError);
    const heartbeat = setInterval(() => updateLastSeen(user.id).catch(showError), 60_000);
    return () => {
      stopConversations();
      stopGroups();
      stopContacts();
      stopPresence();
      clearInterval(heartbeat);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || inboxView !== 'status') return undefined;
    return subscribeToStatuses(user.id, setStatusUpdates, (loadError) => setError(loadError.message));
  }, [inboxView, user?.id]);

  useEffect(() => {
    if (!active || !user) { setMessages([]); return undefined; }
    return subscribeToMessages(active, user, setMessages, (loadError) => setError(loadError.message));
  }, [active, user?.id]);

  useEffect(() => {
    if (!active || active.kind === 'group' || !user || messages.length === 0) return undefined;
    const stage = messageStageRef.current;
    if (!stage || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (document.visibilityState !== 'visible') return;
      const visibleEntries = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      const visibleUnreadMessages = visibleEntries
        .map((entry) => messages.find((message) => message.id === entry.target.dataset.messageId))
        .filter((message) => message
          && message.read !== true
          && (message.senderId || message.sender_id) === active.id
          && (message.recipientId || message.recipient_id) === user.id
          && !readReceiptInFlightRef.current.has(message.id));

      if (!visibleUnreadMessages.length) return;
      visibleUnreadMessages.forEach((message) => readReceiptInFlightRef.current.add(message.id));
      markMessagesAsRead(visibleUnreadMessages, user.id, active.id)
        .catch((loadError) => {
          visibleUnreadMessages.forEach((message) => readReceiptInFlightRef.current.delete(message.id));
          setError(loadError.message);
        });
    }, { root: stage, threshold: 0.5 });

    const messageRows = [...stage.querySelectorAll('[data-message-id]')];
    messageRows.forEach((row) => observer.observe(row));
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') messageRows.forEach((row) => observer.observe(row));
      else observer.disconnect();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer.disconnect();
    };
  }, [active?.id, active?.kind, messages, user?.id]);

  useEffect(() => {
    if (!active || active.kind !== 'group') {
      setGroupMembersById(new Map());
      return undefined;
    }
    let alive = true;
    setGroupMembersById(new Map());
    getGroupMembers(active)
      .then((members) => {
        if (alive) setGroupMembersById(new Map(members.map((member) => [member.id, member])));
      })
      .catch((loadError) => {
        if (alive) setError(loadError.message);
      });
    return () => { alive = false; };
  }, [active?.id, active?.kind]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function handleLogin(result) {
  setUser(result.user);
  setError('');
}

  async function signOut() {
    try {
      await logoutUser();
      setActive(null);
      setConversations([]);
      setGroups([]);
      setMessages([]);
      setStatusUpdates([]);
      setSettingsOpen(false);
      setActiveStatus(null);
      setActiveStatusId(null);
    } catch (signOutError) {
      setError(signOutError.message);
    }
  }

  function openSettings(section = 'profile') {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  function openStatusActivity() {
    setActivityOpen(true);
  }

  function openNotifiedStatus() {
    setActivityOpen(false);
  }

  function updateProfile(profile) {
    setUser(profile);
    setConversations((current) => current.map((person) => person.id === profile.id ? { ...person, ...profile } : person));
    setActive((current) => current?.id === profile.id ? { ...current, ...profile } : current);
  }

  async function saveContact(person, nickname) {
    const savedPerson = await saveFirestoreContact(user.id, person, nickname);
    setContacts((current) => [savedPerson, ...current.filter((contact) => contact.id !== person.id)]);
    setConversations((current) => current.map((conversation) => conversation.id === person.id
      ? { ...conversation, display_name: nickname, saved_as: nickname, profile_name: conversation.profile_name || conversation.display_name }
      : conversation));
    setActive((current) => current?.id === person.id
      ? { ...current, display_name: nickname, saved_as: nickname, profile_name: current.profile_name || current.display_name }
      : current);
  }

  function chooseConversation(person) {
    setActive({ ...person, kind: 'direct' });
    setModalOpen(false);
    setMobileChat(true);
    setSelectedFile(null);
    setSelectedWaveform([]);
    setError('');
    if (!conversations.some((conversation) => conversation.id === person.id)) {
      setConversations((current) => [person, ...current]);
    }
  }

  function chooseGroup(group) {
    setActive({ ...group, kind: 'group' });
    setGroupModalOpen(false);
    setMobileChat(true);
    setSelectedFile(null);
    setSelectedWaveform([]);
    setError('');
  }

  function handleGroupCreated(group) {
    setGroupModalOpen(false);
    chooseGroup(group);
  }

  function syncGroupState(updatedGroup) {
    setGroups((current) => current.map((group) => group.id === updatedGroup.id ? updatedGroup : group));
    setActive((current) => current?.id === updatedGroup.id ? { ...updatedGroup, kind: 'group' } : current);
  }

  async function updateGroupProfile(groupId, updates) {
    const updatedGroup = await updateFirestoreGroupDetails(groupId, updates);
    syncGroupState(updatedGroup);
  }

  async function addGroupMember(groupId, memberId) {
    const updatedGroup = await addFirestoreGroupMember(groupId, memberId);
    syncGroupState(updatedGroup);
  }

  async function removeGroupMember(groupId, memberId) {
    const updatedGroup = await removeFirestoreGroupMember(groupId, memberId);
    syncGroupState(updatedGroup);
  }

  async function leaveCurrentGroup(groupId) {
    await leaveFirestoreGroup(groupId, user.id);
    setGroupDetailsOpen(false);
    setGroups((current) => current.filter((group) => group.id !== groupId));
    setActive((current) => current?.id === groupId ? null : current);
  }

  async function publishStatus() {
    setStatusComposerOpen(false);
    setInboxView('status');
  }

  function removeStatus(statusId) {
    setStatusUpdates((current) => current.map((update) => ({
      ...update,
      statuses: update.statuses.filter((status) => status.id !== statusId),
    })).filter((update) => update.statuses.length > 0));
    setActiveStatus(null);
    setActiveStatusId(null);
  }

  function updateDraft(value) {
    setDraft(value);
  }

  function selectAttachment(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError('Choose a file that is 15 MB or smaller.');
      return;
    }
    setError('');
    setSelectedFile(file);
    setSelectedWaveform([]);
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported by this browser.');
      return;
    }
    setStartingRecording(true);
    setError('');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunksRef.current = [];
      recordingSizeRef.current = 0;
      recordingSamplesRef.current = [];
      setRecordingWaveform(compactWaveform([]));
      cancelRecordingRef.current = false;
      mediaStreamRef.current = stream;
      recorderRef.current = recorder;
      try {
        const AudioContextType = window.AudioContext || window.webkitAudioContext;
        if (AudioContextType) {
          const audioContext = new AudioContextType();
          waveformContextRef.current = audioContext;
          await audioContext.resume();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          audioContext.createMediaStreamSource(stream).connect(analyser);
          waveformAnalyserRef.current = analyser;
          const sampleBuffer = new Uint8Array(analyser.fftSize);
          waveformTimerRef.current = setInterval(() => {
            analyser.getByteTimeDomainData(sampleBuffer);
            let peak = 0;
            for (const sample of sampleBuffer) peak = Math.max(peak, Math.abs(sample - 128) / 128);
            recordingSamplesRef.current.push(Math.min(1, peak * 3));
            setRecordingWaveform(compactWaveform(recordingSamplesRef.current));
          }, 100);
        }
      } catch {
        waveformContextRef.current?.close().catch(() => {});
        waveformContextRef.current = null;
        waveformAnalyserRef.current = null;
      }
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        recordingSizeRef.current += event.data.size;
        if (recordingSizeRef.current > 15 * 1024 * 1024) {
          cancelRecordingRef.current = true;
          sendVoiceOnStopRef.current = false;
          setError('Voice notes must be 15 MB or smaller.');
          setIsRecording(false);
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cancelRecordingRef.current = true;
        setError('Voice recording stopped unexpectedly. Please try again.');
        setIsRecording(false);
      };
      recorder.onstop = () => {
        clearInterval(waveformTimerRef.current);
        waveformTimerRef.current = null;
        waveformAnalyserRef.current = null;
        waveformContextRef.current?.close().catch(() => {});
        waveformContextRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recorderRef.current = null;
        recordingPointerRef.current = null;
        setCancelVoiceSwipe(false);
        setIsRecording(false);
        if (cancelRecordingRef.current) {
          cancelRecordingRef.current = false;
          recordingChunksRef.current = [];
          recordingSamplesRef.current = [];
          setRecordingWaveform(compactWaveform([]));
          return;
        }
        const type = recorder.mimeType || recordingChunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type });
        recordingChunksRef.current = [];
        if (!blob.size) {
          setError('No audio was recorded. Try recording again.');
          return;
        }
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const voiceNote = new File([blob], `voice-note-${Date.now()}.${extension}`, { type });
        const waveform = compactWaveform(recordingSamplesRef.current);
        recordingSamplesRef.current = [];
        setError('');
        if (sendVoiceOnStopRef.current) {
          sendVoiceOnStopRef.current = false;
          sendMessageContent('', voiceNote, waveform);
        } else {
          setSelectedFile(voiceNote);
          setSelectedWaveform(waveform);
        }
      };
      recorder.start(1000);
      setIsRecording(true);
      if (recordingPointerRef.current?.released) {
        const pointerState = recordingPointerRef.current;
        recordingPointerRef.current = null;
        cancelRecordingRef.current = pointerState.cancelled;
        sendVoiceOnStopRef.current = !pointerState.cancelled;
        recorder.stop();
      }
    } catch (recordingError) {
      stream?.getTracks().forEach((track) => track.stop());
      recordingPointerRef.current = null;
      setError(recordingError.name === 'NotAllowedError' || recordingError.name === 'PermissionDeniedError'
        ? 'Allow microphone access to record a voice note.'
        : 'Could not start voice recording. Check your microphone and try again.');
    } finally {
      setStartingRecording(false);
    }
  }

  function stopVoiceRecording(discard = false, send = false) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    cancelRecordingRef.current = discard;
    sendVoiceOnStopRef.current = send && !discard;
    if (discard) setError('');
    recorder.stop();
    setIsRecording(false);
  }

  function beginVoicePress(event) {
    if (event.button !== 0 || startingRecording || sendingMessage || selectedFile) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    recordingPointerRef.current = { id: event.pointerId, startX: event.clientX, cancelled: false, released: false };
    startVoiceRecording();
  }

  function moveVoicePress(event) {
    const pointerState = recordingPointerRef.current;
    if (!pointerState || pointerState.id !== event.pointerId) return;
    pointerState.cancelled = event.clientX < pointerState.startX - 72;
    setCancelVoiceSwipe(pointerState.cancelled);
  }

  function endVoicePress(event, cancelled = false) {
    const pointerState = recordingPointerRef.current;
    if (!pointerState || pointerState.id !== event.pointerId) return;
    pointerState.released = true;
    pointerState.cancelled ||= cancelled || event.clientX < pointerState.startX - 72;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recordingPointerRef.current = null;
    cancelRecordingRef.current = pointerState.cancelled;
    sendVoiceOnStopRef.current = !pointerState.cancelled;
    setCancelVoiceSwipe(false);
    recorder.stop();
    setIsRecording(false);
  }

  async function sendMessageContent(body) {
    if (!body || !active || sendingMessage) return;
    setDraft('');
    setSendingMessage(true);
    try {
      await sendTextMessage({ chat: active, sender: user, body });
    } catch (sendError) {
      setDraft(body);
      setError(sendError.message);
    } finally {
      setSendingMessage(false);
    }
  }

  function sendMessage(event) {
    event.preventDefault();
    sendMessageContent(draft.trim());
  }

  const filteredConversations = conversations.filter((conversation) =>
    `${conversation.display_name || ''} ${conversation.username}`.toLowerCase().includes(filter.toLowerCase()));
  const filteredGroups = groups.filter((group) => group.name.toLowerCase().includes(filter.toLowerCase()));
  const customChatWallpaper = chatWallpaper.startsWith('data:image/jpeg;base64,');
  const wallpaperPreset = ['paper', 'grid', 'sage'].includes(chatWallpaper) ? chatWallpaper : 'paper';

  if (loading) return <main className="loading-screen"><div className="loading-mark"><MessageCircle size={23} /></div><span>Opening your chats…</span></main>;
  if (!user) return <AuthScreen onLogin={handleLogin} />;

  return (
    <main className="messenger-shell" data-theme={theme}>
      <aside className={`sidebar${mobileChat ? ' sidebar-hidden-mobile' : ''}`}>
        <header className="sidebar-header">
          <a className="brand app-brand" href="#"><img className="brand-mark-image" src="/farazchat-mark.svg" alt="" /><span>Faraz<span className="brand-light">Chat</span></span></a>
          <div className="header-actions"><span className={`connection-indicator${socketReady ? ' is-online' : ''}`} title={socketReady ? 'Connected' : 'Connecting'} /><button className="icon-button activity-button" onClick={openStatusActivity} aria-label="Status activity" title="Status activity"><Bell size={18} />{statusNotifications.some((notification) => !notification.read_at) && <i>{statusNotifications.filter((notification) => !notification.read_at).length}</i>}</button><button className="icon-button add-button" onClick={() => setModalOpen(true)} aria-label="New chat" title="New chat"><Plus size={21} /></button><button className="icon-button group-create-button" onClick={() => setGroupModalOpen(true)} aria-label="Create group" title="Create group"><UsersRound size={18} /></button><button className="icon-button settings-button" onClick={() => openSettings('profile')} aria-label="Settings" title="Settings"><Settings size={18} /></button></div>
        </header>
        <div className="inbox-title-row"><div><span className="inbox-kicker">YOUR SPACE</span><h1>Messages <span>{conversations.length || ''}</span></h1></div><button className="text-new-chat" onClick={() => setModalOpen(true)}><Plus size={15} /> New chat</button></div>
        <nav className="inbox-tabs" aria-label="Inbox views">
          <button className={inboxView === 'chats' ? 'inbox-tab-active' : ''} onClick={() => setInboxView('chats')}>Chats <span>{conversations.length || ''}</span></button>
          <button className={inboxView === 'groups' ? 'inbox-tab-active' : ''} onClick={() => setInboxView('groups')}>Groups <span>{groups.length || ''}</span></button>
          <button className={inboxView === 'status' ? 'inbox-tab-active' : ''} onClick={() => setInboxView('status')}>Status</button>
        </nav>
        <label className="search-field conversation-search"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search conversations" /><kbd>/</kbd></label>
        <div className="conversation-list">
          {inboxView === 'chats' && filteredConversations.map((conversation) => <button key={conversation.id} className={`conversation-item${active?.id === conversation.id ? ' conversation-active' : ''}`} onClick={() => chooseConversation(conversation)}>
            <span className="conversation-avatar-wrap"><Avatar name={conversation.display_name || conversation.username} src={conversation.avatar_url} />{onlineUsers.has(conversation.id) && <i className="presence-dot" />}</span>
            <span className="conversation-copy"><span className="conversation-top"><strong>{conversation.display_name || conversation.username}</strong><time>{relativeTime(conversation.last_message_at)}</time></span><span className="conversation-bottom"><span>{conversation.last_message || `#${conversation.contact_code || conversation.username}`}</span>{onlineUsers.has(conversation.id) && <i className="conversation-online-label">Online</i>}</span></span>
          </button>)}
          {inboxView === 'groups' && filteredGroups.map((group) => <button key={group.id} className={`conversation-item group-conversation${active?.kind === 'group' && active.id === group.id ? ' conversation-active' : ''}`} onClick={() => chooseGroup(group)}><span className="group-avatar">{group.avatar_url ? <Avatar name={group.name} src={group.avatar_url} /> : <UsersRound size={18} />}</span><span className="conversation-copy"><span className="conversation-top"><strong>{group.name}</strong><time>{relativeTime(group.last_message_at)}</time></span><span className="conversation-bottom"><span>{group.last_message || group.bio || `${group.member_count} members`}</span></span></span></button>)}
          {inboxView === 'status' && <div className="status-list"><button className="status-list-item my-status-item" onClick={() => { const ownStatus = statusUpdates.find((update) => update.own); if (ownStatus) { setActiveStatus(ownStatus); setActiveStatusId(null); } else setStatusComposerOpen(true); }}><span className="status-ring status-add-ring"><Avatar name={user.display_name || user.username} src={user.avatar_url} /><i>+</i></span><span><strong>My status</strong><small>{statusUpdates.find((update) => update.own)?.statuses.length ? `${statusUpdates.find((update) => update.own).statuses.length} updates · tap to view` : 'Share a photo or update'}</small></span><span className="status-add-control" aria-hidden="true"><Plus size={17} /></span></button>{statusUpdates.filter((update) => !update.own).map((update) => <button className="status-list-item" key={update.user.id} onClick={() => { setActiveStatus(update); setActiveStatusId(null); }}><span className={`status-ring${update.statuses.some((status) => !status.viewed) ? ' status-unviewed' : ''}`}><Avatar name={update.user.display_name || update.user.username} src={update.user.avatar_url} /></span><span><strong>{update.user.display_name || update.user.username}</strong><small>{update.statuses.length} update{update.statuses.length === 1 ? '' : 's'} · {relativeTime(new Date(update.statuses[0].created_at).toISOString().slice(0, 19).replace('T', ' '))}</small></span></button>)}</div>}
          {inboxView === 'chats' && filteredConversations.length === 0 && <div className="inbox-empty"><span className="empty-art"><MessageCircle size={24} /></span><strong>{filter ? 'No matches' : 'A little quiet here'}</strong><span>{filter ? 'Try a different name.' : 'Start a conversation with someone.'}</span>{!filter && <button onClick={() => setModalOpen(true)}>Find someone <span>↗</span></button>}</div>}
          {inboxView === 'groups' && filteredGroups.length === 0 && <div className="inbox-empty"><span className="empty-art"><UsersRound size={24} /></span><strong>{filter ? 'No matches' : 'No groups yet'}</strong><span>{filter ? 'Try another group name.' : 'Bring people together in a group.'}</span>{!filter && <button onClick={() => setGroupModalOpen(true)}>Create group <span>↗</span></button>}</div>}
        </div>
        <button className="profile-footer profile-edit-button" onClick={() => openSettings('profile')} title="Edit profile"><Avatar name={user.display_name || user.username} src={user.avatar_url} /><span className="profile-name"><strong>{user.display_name || user.username}</strong><span>#{user.contact_code || user.username}</span></span><Settings size={16} /></button>
      </aside>

      <section className={`chat-panel${mobileChat ? ' chat-mobile-visible' : ''}`}>
        {active ? <>
          <header className="chat-header"><button className="icon-button back-button" onClick={() => setMobileChat(false)} aria-label="Back to messages"><ArrowLeft size={19} /></button><button className="contact-profile-trigger" onClick={() => active.kind === 'group' ? setGroupDetailsOpen(true) : setContactProfileOpen(true)}><span className={active.kind === 'group' ? 'group-avatar chat-group-avatar' : ''}>{active.kind === 'group' ? (active.avatar_url ? <Avatar name={active.name} src={active.avatar_url} /> : <UsersRound size={19} />) : <Avatar name={active.display_name || active.username} src={active.avatar_url} />}</span><span className="chat-contact"><strong>{active.display_name || active.name || active.username}</strong><span className={`contact-status${active.kind !== 'group' && onlineUsers.has(active.id) ? ' is-online' : ''}`}><i />{contactTyping ? <>{typingName && `${typingName} `}<span className="typing-dots" aria-hidden="true"><i /><i /><i /></span></> : active.kind === 'group' ? `${active.member_count || active.members?.length || 0} members` : <>{onlineUsers.has(active.id) ? 'Online' : 'Offline'} · #{active.contact_code || active.username}</>}</span></span></button><button className="icon-button activity-button chat-activity-button" onClick={openStatusActivity} aria-label="Status activity" title="Status activity"><Bell size={18} />{statusNotifications.some((notification) => !notification.read_at) && <i>{statusNotifications.filter((notification) => !notification.read_at).length}</i>}</button><button className="chat-own-account" onClick={() => openSettings('profile')} aria-label={`Signed in as ${user.display_name || user.username}, code ${user.contact_code || user.username}`} title={`Signed in as ${user.display_name || user.username} · #${user.contact_code || user.username}`}><Avatar name={user.display_name || user.username} src={user.avatar_url} /><span><strong>{user.display_name || user.username}</strong><small>#{user.contact_code || user.username}</small></span></button></header>
          <div ref={messageStageRef} className={`message-stage wallpaper-${customChatWallpaper ? 'custom' : wallpaperPreset}`} style={customChatWallpaper ? { '--chat-wallpaper-image': `url("${chatWallpaper}")` } : undefined}>
            <div className="message-date"><span>YOUR CONVERSATION</span></div>
            {messages.length === 0 && <div className="first-message"><Avatar name={active.kind === 'group' ? active.name : active.display_name || active.username} src={active.avatar_url} large /><strong>{active.kind === 'group' ? active.name : `You and ${active.display_name || active.username}`}</strong><span>{active.kind === 'group' ? 'Your group conversation starts here.' : 'This is the beginning of your conversation.'}</span><span className="first-message-rule" /></div>}
            {messages.map((message, index) => {
              const mine = message.sender_id === user.id;
              const messageSeen = active.kind === 'group' ? message.read_count > 0 : message.is_read;
              const messageDelivered = message.is_delivered || messageSeen || (active.kind === 'group' && message.delivered_count > 0);
              const previous = messages[index - 1];
              const showAuthor = !previous || previous.sender_id !== message.sender_id;
              const senderProfile = active.kind === 'group' ? groupMembersById.get(message.sender_id) : null;
              const senderName = senderProfile?.display_name || senderProfile?.username || message.sender_display_name || message.sender_username;
              return <div className={`message-row${mine ? ' message-mine' : ''}${showAuthor ? ' message-first' : ''}`} data-message-id={message.id} key={message.id}>
                {active.kind === 'group' && !mine && <span className="message-group-avatar"><Avatar name={senderName} src={senderProfile?.avatar_url || ''} /></span>}
                <div className="message-stack">{active.kind === 'group' && showAuthor && !mine && <span className="group-message-author">{senderName}</span>}{message.body && <div className="message-bubble">{message.body}</div>}<span className="message-time">{relativeTime(message.created_at)}{mine && <span className={`message-read-receipt${messageSeen ? ' is-read' : messageDelivered ? ' is-delivered' : ''}`} title={active.kind === 'group' ? `${message.delivered_count || 0} delivered · ${message.read_count || 0} seen` : messageSeen ? 'Seen' : messageDelivered ? 'Delivered' : 'Sent'}>{active.kind === 'group' && message.read_count > 0 && <small>{message.read_count}/{message.recipient_count}</small>}{messageSeen || messageDelivered ? <CheckCheck size={14} /> : <Check size={13} />}</span>}</span></div>
                {active.kind === 'group' && mine && <span className="message-group-avatar"><Avatar name={senderName} src={senderProfile?.avatar_url || ''} /></span>}
              </div>;
            })}
            <div ref={messageEndRef} />
          </div>
          {error && <div className="chat-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}
          <form className="composer" onSubmit={sendMessage}>
            <input value={draft} onChange={(event) => updateDraft(event.target.value)} placeholder={`Message ${active.kind === 'group' ? active.name : active.display_name || active.username}…`} maxLength={4000} aria-label="Message" />
            <span className="composer-divider" />
            <button type="submit" className="send-button" disabled={!draft.trim() || sendingMessage} aria-label="Send message" title="Send message"><Send size={17} /></button>
          </form>
          <div className="chat-privacy"><LockKeyhole size={12} /> Messages are stored in your Firebase account.</div>
        </> : <div className="welcome-panel"><div className="welcome-illustration"><div className="welcome-orbit orbit-one" /><div className="welcome-orbit orbit-two" /><span className="welcome-icon"><MessageCircle size={35} /></span><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" /></div><span className="welcome-eyebrow">A SPACE OF YOUR OWN</span><h2>Make room for<br />a good <span>conversation.</span></h2><p>Choose someone you know, or find a new face by their username.</p><button className="primary-button welcome-button" onClick={() => setModalOpen(true)}><Plus size={17} /> Start a new chat</button><span className="welcome-bottom"><Check size={14} /> Your messages, delivered in real time</span></div>}
      </section>
      {modalOpen && <NewChatModal onClose={() => setModalOpen(false)} onSelect={chooseConversation} />}
      {groupModalOpen && <GroupModal user={user} onClose={() => setGroupModalOpen(false)} onCreate={handleGroupCreated} />}
      {statusComposerOpen && <StatusComposerModal user={user} onClose={() => setStatusComposerOpen(false)} onPublished={publishStatus} />}
      {activityOpen && <StatusActivityModal notifications={statusNotifications} onClose={() => setActivityOpen(false)} onOpenStatus={openNotifiedStatus} />}
      {activeStatus && <StatusViewerModal key={`${activeStatus.user.id}-${activeStatusId || activeStatus.statuses[0]?.id}`} user={user} update={activeStatus} initialStatusId={activeStatusId} onClose={() => { setActiveStatus(null); setActiveStatusId(null); }} onOpenChat={(person) => { setActiveStatus(null); setActiveStatusId(null); chooseConversation(person); }} onDelete={removeStatus} />}
      {groupDetailsOpen && active?.kind === 'group' && <GroupDetailsModal group={active} currentUser={user} onClose={() => setGroupDetailsOpen(false)} onUpdate={updateGroupProfile} onAddMember={addGroupMember} onRemoveMember={removeGroupMember} onLeave={leaveCurrentGroup} />}
      {settingsOpen && <SettingsModal user={user} initialSection={settingsSection} chatWallpaper={chatWallpaper} onWallpaperChange={setChatWallpaper} theme={theme} onThemeChange={setTheme} onClose={() => setSettingsOpen(false)} onSave={updateProfile} onSignOut={signOut} />}
      {contactProfileOpen && active && <ContactProfileModal person={active} online={onlineUsers.has(active.id)} savedName={contacts.find((contact) => contact.id === active.id)?.nickname || active.saved_as} onSaveContact={saveContact} onClose={() => setContactProfileOpen(false)} />}
    </main>
  );
}

export default App;