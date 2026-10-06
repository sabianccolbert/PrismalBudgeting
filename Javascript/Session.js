const TIMEOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const WARNING_SECONDS = 60;               // The idle warning shows for the last minute
let lastThrottleTime = 0;
let idleWarning = null;

// 1. Still signed in? Signs out (and returns false) after 15 minutes without activity, or when another
// tab signed out
function verifySession() {
  const token = localStorage.getItem('prismal_jwt');
  const lastActivity = localStorage.getItem('prismal_last_activity');

  // If not logged in, send to login page
  if (!token) {
    window.location.replace('/login.html');
    return false;
  }

  // If 15+ minutes have passed since last activity
  if (lastActivity && Date.now() - parseInt(lastActivity, 10) >= TIMEOUT_DURATION) {
    // The server ends the session too (Layout.js), then this browser forgets it. Nothing more is saved
    // (and leaving doesn't ask about it).
    if (typeof workspaceLoaded !== 'undefined') workspaceLoaded = false;
    if (typeof endServerSession === 'function') endServerSession();
    if (typeof clearSignedInData === 'function') clearSignedInData();
    else ['prismal_jwt', 'prismal_username', 'prismal_last_activity'].forEach(key => localStorage.removeItem(key));
    try { sessionStorage.setItem('prismal_signed_out', 'idle'); } catch (e) {} // The login page says why

    window.location.replace('/login.html'); // Redirect to login
    return false;
  }
  return true;
}

// 2. A tap, key, scroll, or mouse move counts as activity. Checked and saved at most every 5 seconds
// (mouse moves come dozens of times a second).
function updateActivity() {
  const now = Date.now();
  if (now - lastThrottleTime < 5000) return;
  lastThrottleTime = now;

  // A page left idle too long signs out before this counts as activity
  if (!verifySession()) return;
  localStorage.setItem('prismal_last_activity', now.toString());
}

// 3. The last minute before an idle sign-out: a notice counting down. Any tap, key, or scroll counts as
// activity, which keeps you signed in and takes the notice away. (A page left in the background just
// signs out when it's opened again.)
function updateIdleWarning() {
  const lastActivity = parseInt(localStorage.getItem('prismal_last_activity') || '0', 10);
  const secondsLeft = Math.ceil((TIMEOUT_DURATION - (Date.now() - lastActivity)) / 1000);
  const showing = !!localStorage.getItem('prismal_jwt') && lastActivity > 0 && secondsLeft > 0 && secondsLeft <= WARNING_SECONDS && document.visibilityState === 'visible';
  if (!showing) {
    if (idleWarning) {
      idleWarning.remove();
      idleWarning = null;
    }
    if (lastActivity > 0 && secondsLeft <= 0) verifySession();
    return;
  }
  if (!idleWarning) {
    idleWarning = document.createElement('div');
    idleWarning.className = 'idleWarning';
    idleWarning.setAttribute('role', 'alert');
    document.body.appendChild(idleWarning);
  }
  idleWarning.textContent = `For your security, you'll be signed out in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}. Tap anywhere or press a key to stay signed in.`;
}

// 4. Immediate check on page load
verifySession();

// 5. Listen for user activity (mouse, touch, keyboard, scroll)
['click', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(eventType => {
  window.addEventListener(eventType, updateActivity, { passive: true });
});

// 6. Catch when user unlocks phone or switches back to tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    verifySession();
  }
});
window.addEventListener('pageshow', verifySession);

// 7. Active check every 30 seconds while page stays open, and the idle warning every second
setInterval(verifySession, 30000);
setInterval(updateIdleWarning, 1000);
