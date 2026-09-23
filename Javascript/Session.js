const TIMEOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
let lastThrottleTime = 0;

// 1. Function to check if 15 minutes have passed
function verifySession() {
  const userId = localStorage.getItem('prismal_user_id');
  const lastActivity = localStorage.getItem('prismal_last_activity');

  // If not logged in, send to login page
  if (!userId) {
    window.location.replace('/login.html');
    return;
  }

  if (lastActivity) {
    const timeElapsed = Date.now() - parseInt(lastActivity, 10);

    // If 15+ minutes have passed since last activity
    if (timeElapsed >= TIMEOUT_DURATION) {
      localStorage.clear(); // Clear session
      window.location.replace('/login.html'); // Redirect to login
    }
  }
}

// 2. Function to update the last activity time when user interacts
function updateActivity() {
  const now = Date.now();

  // Check if session is already expired before updating
  verifySession();

  // Throttle writes to localStorage (only write at most once every 5 seconds)
  if (now - lastThrottleTime > 5000) {
    lastThrottleTime = now;
    localStorage.setItem('prismal_last_activity', now.toString());
  }
}

// 3. Immediate check on page load
verifySession();

// 4. Listen for user activity (mouse, touch, keyboard, scroll)
['click', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(eventType => {
  window.addEventListener(eventType, updateActivity, { passive: true });
});

// 5. Catch when user unlocks phone or switches back to tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    verifySession();
  }
});
window.addEventListener('pageshow', verifySession);

// 6. Active check every 30 seconds while page stays open
setInterval(verifySession, 30000);