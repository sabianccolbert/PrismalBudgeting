const authForm = document.getElementById('auth-form');
const pageTitle = document.querySelector('header .logo');
const formHint = document.getElementById('form-hint');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const passwordLabel = document.getElementById('password-label');
const verifyInput = document.getElementById('verify-password');
const termsInput = document.getElementById('agree-terms');
const primaryBtn = document.getElementById('primary-action-btn');
const toggleBtn = document.getElementById('toggle-mode-btn');
const forgotBtn = document.getElementById('forgot-btn');
const statusMessage = document.getElementById('status-message');

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_KEYS = ['prismal_jwt', 'prismal_username', 'prismal_last_activity'];

// The link in a password reset email is /login.html?reset=<token>
const pageParams = new URLSearchParams(location.search);
const resetToken = pageParams.get('reset');

// What each mode shows. Groups it doesn't list are hidden, and their inputs disabled so the
// browser's required checks skip them.
const ALL_GROUPS = ['username-group', 'email-group', 'password-group', 'verify-password-group', 'terms-group'];
const MODES = {
  login: {
    title: 'Sign In To Prismal Budget',
    groups: ['username-group', 'password-group'],
    primary: 'Login',
    toggle: 'New Account?',
    showForgot: true
  },
  create: {
    title: 'Create Your Account',
    groups: ['username-group', 'email-group', 'password-group', 'verify-password-group', 'terms-group'],
    primary: 'Create Account',
    toggle: 'Back to Login',
    newPassword: true
  },
  forgot: {
    title: 'Reset Your Password',
    hint: "Enter your account's email, and we'll send you a link to choose a new password.",
    groups: ['email-group'],
    primary: 'Send Reset Link',
    toggle: 'Back to Login'
  },
  reset: {
    title: 'Choose A New Password',
    hint: `Pick a new password (at least ${MIN_PASSWORD_LENGTH} characters). Changing it signs you out on every device.`,
    groups: ['password-group', 'verify-password-group'],
    primary: 'Set New Password',
    toggle: 'Back to Login',
    newPassword: true,
    passwordLabel: 'New Password'
  }
};

let mode = 'login';

function setMode(newMode) {
  mode = newMode;
  const config = MODES[mode];
  setStatus('');
  pageTitle.textContent = config.title;
  formHint.textContent = config.hint || '';
  formHint.classList.toggle('hidden', !config.hint);

  for (const id of ALL_GROUPS) {
    const group = document.getElementById(id);
    const shown = config.groups.includes(id);
    group.classList.toggle('hidden', !shown);
    group.querySelectorAll('input').forEach(input => { input.disabled = !shown; });
  }

  passwordLabel.textContent = config.passwordLabel || 'Password';
  passwordInput.autocomplete = config.newPassword ? 'new-password' : 'current-password';
  primaryBtn.textContent = config.primary;
  toggleBtn.textContent = config.toggle;
  forgotBtn.classList.toggle('hidden', !config.showForgot);
}

function setStatus(message, isSuccess = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isSuccess ? 'var(--BASE_COLOR)' : 'var(--LINK_LIGHT)';
}

// Drop ?reset=... (or ?deleted) so a reload doesn't bring it back
function clearPageParams() {
  history.replaceState(null, '', location.pathname);
}

toggleBtn.addEventListener('click', () => {
  if (mode === 'reset') clearPageParams();
  setMode(mode === 'login' ? 'create' : 'login');
});

forgotBtn.addEventListener('click', () => setMode('forgot'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (mode === 'create' || mode === 'reset') {
    if (password !== verifyInput.value) {
      setStatus("Passwords do not match.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
  }
  if ((mode === 'create' || mode === 'forgot') && !EMAIL_PATTERN.test(email)) {
    setStatus("Enter a valid email address.");
    return;
  }
  if (mode === 'create' && !termsInput.checked) {
    setStatus("Please agree to the Privacy Policy & Terms of Use to create an account.");
    return;
  }

  const requests = {
    login: ['/api/login', { username, password }],
    create: ['/api/register', { username, email, password, agreedToTerms: true }],
    forgot: ['/api/password/forgot', { email }],
    reset: ['/api/password/reset', { token: resetToken, password }]
  };
  const [endpoint, body] = requests[mode];
  primaryBtn.disabled = true;

  try {
    const response = await fetch(`${window.API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success) {
      if (mode === 'login') {
        // --- JWT CHANGE HERE ---
        // Save the JWT token instead of raw User ID
        localStorage.setItem('prismal_jwt', data.token);
        localStorage.setItem('prismal_username', data.username);
        localStorage.setItem('prismal_last_activity', Date.now().toString());

        if (typeof window.transitionTo === 'function') {
          window.transitionTo("/index.html", true);
        } else {
          window.location.replace("/index.html");
        }
      } else if (mode === 'create') {
        // The username and password stay filled in, ready to log in
        setMode('login');
        setStatus("Account created! Please log in.", true);
      } else if (mode === 'forgot') {
        setStatus("If an account uses that email, a reset link is on its way. It works for 1 hour, so check your inbox (and spam folder).", true);
      } else {
        // The new password signed out every device, including this one
        SESSION_KEYS.forEach(key => localStorage.removeItem(key));
        clearPageParams();
        setMode('login');
        usernameInput.value = data.username || '';
        passwordInput.value = '';
        setStatus("Password changed! Log in with your new password.", true);
      }
    } else if (mode === 'reset' && data.expired) {
      clearPageParams();
      setMode('forgot');
      setStatus("That reset link has expired or was already used. Enter your email to get a new one.");
    } else {
      setStatus(data.error || "An error occurred.");
    }
  } catch (err) {
    console.error(err);
    setStatus("Failed to connect to the server.");
  } finally {
    primaryBtn.disabled = false;
  }
});

// Start in the mode the link asked for
if (resetToken) {
  setMode('reset');
} else {
  setMode('login');
  if (pageParams.has('deleted')) {
    setStatus("Your account and all of its data were deleted.", true);
    clearPageParams();
  }
}
