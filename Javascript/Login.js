const authForm = document.getElementById('auth-form');
const pageTitle = document.querySelector('header .logo');
const formHint = document.getElementById('form-hint');
const usernameInput = document.getElementById('username');
const usernameLabel = document.getElementById('username-label');
const emailInput = document.getElementById('email');
const birthdateInput = document.getElementById('birthdate');
// The date box can't pick a day after today (local time)
birthdateInput.max = [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()].map(n => String(n).padStart(2, '0')).join('-');
const passwordInput = document.getElementById('password');
const passwordLabel = document.getElementById('password-label');
const verifyInput = document.getElementById('verify-password');
const termsInput = document.getElementById('agree-terms');
const passkeyInput = document.getElementById('turn-on-passkey');
const primaryBtn = document.getElementById('primary-action-btn');
const passkeyBtn = document.getElementById('passkey-btn');
const toggleBtn = document.getElementById('toggle-mode-btn');
const forgotBtn = document.getElementById('forgot-btn');
const statusMessage = document.getElementById('status-message');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_KEYS = ['prismal_jwt', 'prismal_username', 'prismal_last_activity'];

// The API's rules (account.js readUsername, passwords.js passwordRuleProblem). Usernames: 5 to 30
// characters, any you can see. Passwords: 8 to 256 characters, any at all. Both count characters the way
// a person does (an emoji is one).
const MIN_USERNAME = 5;
const MAX_USERNAME = 30;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 256;
// Invisible characters (control, format, and default-ignorable ones, and the blank Braille pattern),
// except the joiners, variation selectors, and tags inside emoji (the API's HIDDEN_CHARACTERS)
const HIDDEN_CHARACTERS = /(?![\u200C\u200D\uFE00-\uFE0F\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}])[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}\u2800]/u;

// Characters as a person counts them (an accented letter or an emoji is one)
function countCharacters(text) {
  if (typeof Intl === 'object' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;
  }
  return [...text].length;
}

// What's wrong with a new username, or '' when it's fine
function usernameProblem(value) {
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (HIDDEN_CHARACTERS.test(name)) return "Usernames can't have invisible characters, or ones that change which way text runs.";
  const length = countCharacters(name);
  if (length < MIN_USERNAME || length > MAX_USERNAME) return `Usernames are ${MIN_USERNAME} to ${MAX_USERNAME} characters. Any characters you can see work, spaces included.`;
  return '';
}

// What's wrong with a new password, or '' when it's fine
function passwordProblem(value) {
  const length = [...value.normalize('NFKC')].length;
  if (length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (length > MAX_PASSWORD) return `Password can be at most ${MAX_PASSWORD} characters.`;
  return '';
}

// Prismal Budget is for people 18 and older (the API's readBirthdate): an account can't be made for anyone younger.
// value: the date box's "YYYY-MM-DD".
const MIN_AGE = 18;
const MAX_AGE = 120;
function birthdateProblem(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Enter your birth date.';
  const [year, month, day] = match.slice(1).map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age--;
  if (age < 0 || age > MAX_AGE) return 'Enter your birth date.';
  if (age < MIN_AGE) return `Prismal Budget is for people ${MIN_AGE} and older, so an account can't be made for someone younger.`;
  return '';
}

// Why the last page signed out, when it says (see Session.js, Process Budget.js, Settings Page.js)
const SIGNED_OUT_REASONS = {
  idle: "You were signed out after 15 minutes without activity, to keep your budget safe. Please sign in again.",
  expired: "You've been signed out (your session ended, or it was signed out from another device). Please sign in again.",
  everywhere: "You've been signed out on every device, and your Quick Entry icons were turned off.",
  quickKey: "That Quick Entry icon doesn't work anymore, because your password changed or the icon was replaced. Delete it, then sign in and tap Quick Entry on Home to make a new one."
};

// What unlocks a passkey on this device, like "Face ID or Touch ID" (see Passkeys.js)
const UNLOCK = Passkeys.unlockName() ? ` (${Passkeys.unlockName()})` : '';
document.getElementById('passkey-label').textContent = `Turn on passkey sign-in${UNLOCK}`;

// The link in a password reset email is /login.html?reset=<token>. The code moves out of the address
// right away (into this tab's session storage, so a reload still works), so it isn't left showing in the
// address bar or saved in the browser's history. The link in an email verification email,
// /login.html?verify=<token>, is checked with the API as soon as the page opens, and leaves the address too.
const pageParams = new URLSearchParams(location.search);
const RESET_TOKEN_KEY = 'prismal_reset_token';
let resetToken = pageParams.get('reset');
const verifyToken = pageParams.get('verify');
try {
  if (resetToken) sessionStorage.setItem(RESET_TOKEN_KEY, resetToken);
  else if (!verifyToken) resetToken = sessionStorage.getItem(RESET_TOKEN_KEY);
} catch (e) {}
if (pageParams.has('reset') || pageParams.has('verify')) history.replaceState(null, '', location.pathname);

// Signed in on this device (a verification link can be opened either way)
const signedInHere = (() => {
  try { return !!localStorage.getItem('prismal_jwt'); } catch (e) { return false; }
})();

// The reset code is used up (or given up on): forget it
function forgetResetToken() {
  resetToken = null;
  try { sessionStorage.removeItem(RESET_TOKEN_KEY); } catch (e) {}
}

// What each mode shows. Groups it doesn't list are hidden, and their inputs disabled so the
// browser's required checks skip them. passkeys: the passkey button and passkey autofill.
const ALL_GROUPS = ['username-group', 'email-group', 'age-group', 'password-group', 'verify-password-group', 'terms-group', 'passkey-group'];
const MODES = {
  login: {
    title: 'Sign In To Prismal Budget',
    groups: ['username-group', 'password-group', 'passkey-group'],
    primary: 'Login',
    toggle: 'New Account?',
    showForgot: true,
    passkeys: true
  },
  create: {
    title: 'Create Your Account',
    hint: `Prismal Budget is for people ${MIN_AGE} and older.`,
    groups: ['username-group', 'email-group', 'age-group', 'password-group', 'verify-password-group', 'terms-group'],
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
    hint: `Pick a new password (at least ${MIN_PASSWORD} characters, any you like). Changing it signs you out on every device, and turns off passkey sign-in until you turn it back on in Settings.`,
    groups: ['password-group', 'verify-password-group'],
    primary: 'Set New Password',
    toggle: 'Back to Login',
    newPassword: true,
    passwordLabel: 'New Password'
  },
  // Signed in with a password with "Turn on passkey sign-in" switched on
  offer: {
    title: 'Turn On Passkey Sign-In?',
    hint: `Next time, sign in with a passkey${UNLOCK} instead of typing your password. Your password keeps working too, and your face or fingerprint never leaves this device. You can change this anytime in Settings.`,
    groups: [],
    primary: 'Yes, Turn It On',
    toggle: 'No Thanks'
  },
  // The link in an email verification email (signed in here: on to the Spreadsheets page or Home; signed out: sign in)
  verify: {
    title: 'Verify Your Email',
    groups: [],
    primary: signedInHere ? 'Open Spreadsheets' : 'Sign In',
    toggle: signedInHere ? 'Go Home' : ''
  }
};

let mode = 'login';

// Switch the page to a mode: its title, hint, fields, and buttons
function setMode(newMode) {
  mode = newMode;
  const config = MODES[mode];
  setStatus('');
  pageTitle.textContent = config.title;
  formHint.textContent = config.hint || '';
  formHint.classList.toggle('hidden', !config.hint);

  for (const id of ALL_GROUPS) {
    const group = document.getElementById(id);
    // The passkey checkbox only shows where this browser can make one
    const shown = config.groups.includes(id) && (id !== 'passkey-group' || Passkeys.usable);
    group.classList.toggle('hidden', !shown);
    group.querySelectorAll('input').forEach(input => { input.disabled = !shown; });
  }

  passwordLabel.textContent = config.passwordLabel || 'Password';
  passwordInput.autocomplete = config.newPassword ? 'new-password' : 'current-password';
  usernameInput.autocomplete = config.passkeys ? 'username webauthn' : 'username';
  // Signing in takes the username or the email; a new account picks a username
  usernameLabel.textContent = mode === 'create' ? 'Username' : 'Username or Email';
  usernameInput.maxLength = 400; // Room for 30 emoji; the rule itself is checked on submit
  primaryBtn.textContent = config.primary;
  toggleBtn.textContent = config.toggle;
  toggleBtn.classList.toggle('hidden', !config.toggle);
  forgotBtn.classList.toggle('hidden', !config.showForgot);
  passkeyBtn.classList.toggle('hidden', !(config.passkeys && Passkeys.supported));
  if (config.passkeys) startPasskeyAutofill();
  else stopPasskeyAutofill();
}

// The message under the form (light for good news, red otherwise)
function setStatus(message, isSuccess = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isSuccess ? 'var(--BASE_COLOR)' : 'var(--LINK_LIGHT)';
}

// Drop ?deleted (or anything else) so a reload doesn't bring it back
function clearPageParams() {
  history.replaceState(null, '', location.pathname);
}

toggleBtn.addEventListener('click', () => {
  if (mode === 'offer') {
    declinePasskeys();
    return;
  }
  if (mode === 'verify') {
    leaveTo('/index.html');
    return;
  }
  if (mode === 'reset') forgetResetToken();
  setMode(mode === 'login' ? 'create' : 'login');
});

forgotBtn.addEventListener('click', () => setMode('forgot'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (mode === 'offer') {
    addPasskey();
    return;
  }
  if (mode === 'verify') {
    if (signedInHere) leaveTo('/menu/spreadsheets.html');
    else setMode('login');
    return;
  }
  setStatus('');

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (mode === 'create' || mode === 'reset') {
    if (password !== verifyInput.value) {
      setStatus("Passwords do not match.");
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      setStatus(problem);
      return;
    }
  }
  if (mode === 'create') {
    const problem = usernameProblem(username);
    if (problem) {
      setStatus(problem);
      return;
    }
  }
  if ((mode === 'create' || mode === 'forgot') && !EMAIL_PATTERN.test(email)) {
    setStatus("Enter a valid email address.");
    return;
  }
  if (mode === 'create') {
    const problem = birthdateProblem(birthdateInput.value);
    if (problem) {
      setStatus(problem);
      return;
    }
  }
  if (mode === 'create' && !termsInput.checked) {
    setStatus("Please agree to the Privacy Policy & Terms of Use to create an account.");
    return;
  }

  const requests = {
    login: ['/api/login', { username, password }],
    create: ['/api/register', { username, email, birthdate: birthdateInput.value, password, agreedToTerms: true }],
    forgot: ['/api/password/forgot', { email }],
    reset: ['/api/password/reset', { token: resetToken, password }]
  };
  const [endpoint, body] = requests[mode];
  primaryBtn.disabled = true;
  const { ok, status, data } = await api(endpoint, body);
  primaryBtn.disabled = false;

  if (ok && data.success) {
    if (mode === 'login') {
      signedIn(data, password);
    } else if (mode === 'create') {
      // The username and password stay filled in, ready to log in
      setMode('login');
      setStatus(data.verificationSent
        ? `Account created! We emailed a link to ${email} to verify it (it works for 24 hours). If it isn't in your inbox, check your spam folder. Please log in.`
        : "Account created! Please log in.", true);
    } else if (mode === 'forgot') {
      setStatus("If an account uses that email, a reset link is on its way. It works for 1 hour, so check your inbox (and spam folder).", true);
    } else {
      // The new password signed out every device, including this one
      SESSION_KEYS.forEach(key => localStorage.removeItem(key));
      forgetResetToken();
      setMode('login');
      usernameInput.value = data.username || '';
      passwordInput.value = '';
      setStatus(data.passkeysTurnedOff
        ? "Password changed! Log in with your new password. Passkey sign-in was turned off to be safe, and you can turn it back on in Settings."
        : "Password changed! Log in with your new password.", true);
    }
  } else if (mode === 'reset' && data.expired) {
    forgetResetToken();
    setMode('forgot');
    setStatus("That reset link has expired or was already used. Enter your email to get a new one.");
  } else {
    setStatus(status === 0 ? "Failed to connect to the server." : (data.error || "An error occurred."));
  }
});

// POST to the API: { ok, status (0 when it couldn't be reached), data }. signedIn: send the session.
async function api(endpoint, body, signedIn = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (signedIn) headers.Authorization = `Bearer ${localStorage.getItem('prismal_jwt')}`;
  try {
    const response = await fetch(`${window.API_BASE_URL}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data: data || {} };
  } catch (err) {
    console.error(err);
    return { ok: false, status: 0, data: {} };
  }
}

// The token stands in for the password on every other page (Session.js signs out after 15 idle minutes)
function saveSession(data) {
  localStorage.setItem('prismal_jwt', data.token);
  localStorage.setItem('prismal_username', data.username);
  localStorage.setItem('prismal_last_activity', Date.now().toString());
}

// On to the budget (Home), signed in
function goToBudget() {
  stopPasskeyAutofill();
  if (typeof window.transitionTo === 'function') {
    window.transitionTo("/index.html", true);
  } else {
    window.location.replace("/index.html");
  }
}

// Off to another page of the site (it slides out like any link)
function leaveTo(path) {
  if (typeof window.transitionTo === 'function') window.transitionTo(path, true);
  else window.location.replace(path);
}

// The link in a verification email: the API verifies the address it was sent to (signed in or not)
async function verifyEmailLink(token) {
  setMode('verify');
  setStatus('Verifying your email...', true);
  primaryBtn.disabled = true;
  const { ok, status, data } = await api('/api/email/verify', { token });
  primaryBtn.disabled = false;
  if (ok && data.success) {
    setStatus(`Your email, ${data.email}, is verified! You can connect spreadsheets now (Menu, then Spreadsheets).`, true);
  } else if (data.expired) {
    setStatus(signedInHere
      ? "That verification link has expired, or your email changed since it was sent. Open Settings and tap Send Verification Email for a new one."
      : "That verification link has expired, or your email changed since it was sent. Sign in, then tap Send Verification Email in Settings for a new one.");
  } else {
    setStatus(status === 0 ? "Failed to connect to the server. Open the link again to try once more." : (data.error || "An error occurred."));
  }
}

// =====================================================================
// #region PASSKEY SIGN-IN (the button, and passkey autofill on the username box)
// =====================================================================

let signInReady = null; // { options, at }: a challenge fetched ahead, so a tap starts the device's check right away
let autofill = null;    // { controller, settled }: the autofill request waiting on the username box
let autofillTimer = null;
let autofillRun = 0;    // Bumped on every start and stop, so an older start that's still loading gives up

// Fetch a sign-in challenge. Resolves to '' when it's ready, or an error to show.
async function prepareSignIn() {
  const { ok, status, data } = await api('/api/passkey/login/options', {});
  signInReady = ok && data.options ? { options: data.options, at: Date.now() } : null;
  if (signInReady) return '';
  return status === 0 ? "Failed to connect to the server." : (data.error || "Passkey sign-in isn't available right now.");
}

// Is the challenge fetched ahead still fresh enough to use?
const signInIsFresh = () => !!signInReady && Date.now() - signInReady.at < Passkeys.FRESH_MS;

// Keeps a challenge ready while the login page is up (a new one before it gets old), for the button and for
// passkey autofill: browsers with autofill list the site's passkeys under the username box, and that request
// waits there until one is picked. Safari only lets a tap start the device's check if the tap doesn't have
// to wait on the server first, which is why the challenge is fetched ahead even without autofill.
async function startPasskeyAutofill() {
  await stopPasskeyAutofill();
  const run = autofillRun;
  if (!Passkeys.usable || mode !== 'login') return;
  if (!signInIsFresh() && await prepareSignIn()) return;
  if (run !== autofillRun || mode !== 'login') return;
  autofillTimer = setTimeout(startPasskeyAutofill, Passkeys.FRESH_MS);
  if (!(await Passkeys.autofillAvailable()) || run !== autofillRun) return;
  const controller = new AbortController();
  const request = navigator.credentials.get({ publicKey: Passkeys.signInRequest(signInReady.options), mediation: 'conditional', signal: controller.signal });
  autofill = { controller, settled: request.then(() => {}, () => {}) };
  let credential;
  try {
    credential = await request;
  } catch (error) {
    // (A phone can stop it when the page goes to the background: it starts again when the page is back)
    if (error.name !== 'AbortError') console.warn("Passkey autofill stopped:", error);
    if (autofill && autofill.controller === controller) autofill = null;
    return;
  }
  if (autofill && autofill.controller === controller) autofill = null;
  clearTimeout(autofillTimer);
  await finishPasskeySignIn(credential);
}

// Cancels the autofill request. Resolves once it has closed (a second at most): Chrome and Edge refuse a
// new passkey request while the old one is still closing, and say it was "cancelled or timed out".
function stopPasskeyAutofill() {
  autofillRun++;
  clearTimeout(autofillTimer);
  if (!autofill) return Promise.resolve();
  const { controller, settled } = autofill;
  autofill = null;
  controller.abort();
  return Promise.race([settled, new Promise(resolve => setTimeout(resolve, 1000))]);
}

// Back on the login page (another app, another tab, or the phone woke up): a fresh challenge, and autofill
// waiting again if the phone stopped it
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && mode === 'login' && (!autofill || !signInIsFresh())) startPasskeyAutofill();
});

// The device's passkey sheet. It has to open right in the tap (Safari refuses one that waited on anything
// first), so nothing is awaited before it. If the browser refused it at once (the autofill request it just
// cancelled was still closing: "A request is already pending", or a no faster than anyone could answer), it's
// tried once more as soon as that request has closed. autofillClosed: resolves when it has.
async function requestPasskey(options, autofillClosed) {
  const publicKey = Passkeys.signInRequest(options);
  const started = Date.now();
  try {
    return await navigator.credentials.get({ publicKey });
  } catch (error) {
    const refusedAtOnce = /pending/i.test(error.message || '') || Date.now() - started < Passkeys.INSTANT_MS;
    if (error.name !== 'NotAllowedError' || !refusedAtOnce) throw error;
    await autofillClosed;
    await new Promise(resolve => setTimeout(resolve, 100));
    return navigator.credentials.get({ publicKey });
  }
}

passkeyBtn.addEventListener('click', async () => {
  setStatus('');
  if (!Passkeys.usable) {
    setStatus(Passkeys.onIpAddress ? Passkeys.IP_ADDRESS_TEXT : "This browser can't use passkeys.");
    return;
  }
  passkeyBtn.disabled = true;
  const autofillClosed = stopPasskeyAutofill(); // One passkey request at a time (not waited on: see requestPasskey)
  // Without a challenge ready, this tap has to wait on the server first, and Safari may then not let it
  // open the passkey sheet: the next tap will
  const hadToWait = !signInIsFresh();
  if (hadToWait) {
    const error = await prepareSignIn();
    if (error) {
      passkeyBtn.disabled = false;
      setStatus(error);
      startPasskeyAutofill();
      return;
    }
  }
  let credential;
  try {
    credential = await requestPasskey(signInReady.options, autofillClosed);
  } catch (error) {
    passkeyBtn.disabled = false;
    setStatus(hadToWait && error.name === 'NotAllowedError'
      ? "Passkey sign-in is ready now. Tap Sign In With A Passkey again."
      : Passkeys.problem(error));
    startPasskeyAutofill();
    return;
  }
  await finishPasskeySignIn(credential);
  passkeyBtn.disabled = false;
});

// The device answered: the API checks it and, when it's good, signs in the passkey's account
async function finishPasskeySignIn(credential) {
  signInReady = null; // Its challenge is used up
  setStatus('');
  const { ok, status, data } = await api('/api/passkey/login', Passkeys.signInAnswer(credential));
  if (ok && data.success) {
    saveSession(data);
    goToBudget();
    return;
  }
  if (data.unknownPasskey) Passkeys.forget(credential.id); // So the device stops offering it
  if (data.passkeysOff && passkeyInput && !passkeyInput.disabled) {
    // Turned off in Settings: signing in with the password with the switch on turns it back on
    passkeyInput.checked = true;
    setStatus("Passkey sign-in is turned off for this account. Sign in with your password: \"Turn on passkey sign-in\" is on, so it turns back on.");
    startPasskeyAutofill();
    return;
  }
  setStatus(status === 0 ? "Failed to connect to the server." : (data.error || "That passkey couldn't sign you in."));
  startPasskeyAutofill();
}

//#endregion

// =====================================================================
// #region TURNING PASSKEYS ON (the checkbox, or the question after a password sign-in)
// =====================================================================

let offerPassword = ''; // The password just typed: adding a passkey checks it again
let addReady = null;    // { options, at }: a challenge for making a passkey, fetched ahead
let addPreparing = null;

// Signed in with a password. The switch on means make a passkey for this device now; off goes straight
// to the budget (nothing about passkeys changes).
function signedIn(data, password) {
  saveSession(data);
  if (Passkeys.usable && passkeyInput.checked) {
    offerPassword = password;
    setMode('offer');
    addPasskey(true);
    return;
  }
  goToBudget();
}

// Resolves to '' when a challenge is ready, or an error to show
function prepareNewPasskey() {
  addPreparing = api('/api/passkey/add/options', { password: offerPassword }, true).then(({ ok, status, data }) => {
    addPreparing = null;
    addReady = ok && data.options ? { options: data.options, at: Date.now() } : null;
    if (addReady) return '';
    return status === 0 ? "Failed to connect to the server." : (data.error || "Couldn't turn on passkey sign-in. Please try again.");
  });
  return addPreparing;
}

// Yes (or the switch): the device makes a passkey, and the API saves it and turns passkey sign-in on.
// Right after signing in (firstTry), it's tried straight away; Safari only makes one right in a tap, and
// signing in waited on the server, so there it's refused at once, and Yes (a tap) makes it.
async function addPasskey(firstTry = false) {
  setStatus('');
  const hadToWait = firstTry || !addReady || Date.now() - addReady.at >= Passkeys.FRESH_MS;
  if (!addReady || Date.now() - addReady.at >= Passkeys.FRESH_MS) {
    primaryBtn.disabled = true;
    const error = await (addPreparing || prepareNewPasskey());
    primaryBtn.disabled = false;
    if (error) {
      setStatus(error);
      return;
    }
  }
  let credential;
  const started = Date.now();
  try {
    credential = await navigator.credentials.create({ publicKey: Passkeys.addRequest(addReady.options) });
  } catch (error) {
    if (error.name === 'InvalidStateError') {
      await alreadyHasPasskey();
      return;
    }
    console.warn("The device didn't make a passkey:", error);
    if (hadToWait && error.name === 'NotAllowedError' && Date.now() - started < Passkeys.INSTANT_MS) {
      setStatus("One more step: press Yes, Turn It On, and your device asks for your face, fingerprint, or PIN to make the passkey.", true);
      return;
    }
    setStatus(`${Passkeys.problem(error, true)} Press Yes to try again, or No Thanks to skip it.`);
    return;
  }
  primaryBtn.disabled = toggleBtn.disabled = true;
  const { ok, status, data } = await api('/api/passkey/add', { name: Passkeys.deviceName(), credential: Passkeys.addAnswer(credential) }, true);
  addReady = null;
  if (!ok) {
    primaryBtn.disabled = toggleBtn.disabled = false;
    setStatus(status === 0 ? "Failed to connect to the server." : (data.error || "Couldn't turn on passkey sign-in. Please try again."));
    return;
  }
  offerPassword = '';
  setStatus("Passkey sign-in is on! Next time, press Sign In With A Passkey, or pick your passkey under the username box.", true);
  setTimeout(goToBudget, 2500);
}

// This device already has one of the account's passkeys, so passkey sign-in only needs to be on
async function alreadyHasPasskey() {
  primaryBtn.disabled = toggleBtn.disabled = true;
  const { ok } = await api('/api/passkey/turn', { on: true }, true);
  offerPassword = '';
  setStatus(ok ? "This device already has a passkey for your account, so passkey sign-in is on." : "This device already has a passkey for your account.", true);
  setTimeout(goToBudget, 2500);
}

// No Thanks: no passkey for this device right now. Passkey sign-in stays as it was for the account (passkeys
// made on other devices keep working); Settings can add one later.
function declinePasskeys() {
  primaryBtn.disabled = toggleBtn.disabled = true;
  offerPassword = '';
  goToBudget();
}

//#endregion

// Start in the mode the link asked for (?new: the front page's Create Account)
if (verifyToken) {
  verifyEmailLink(verifyToken);
} else if (resetToken) {
  setMode('reset');
} else {
  setMode(pageParams.has('new') ? 'create' : 'login');
  if (pageParams.has('new')) clearPageParams();
  let signedOut = null;
  try {
    signedOut = sessionStorage.getItem('prismal_signed_out');
    sessionStorage.removeItem('prismal_signed_out');
  } catch (e) {}
  if (pageParams.has('deleted')) {
    setStatus("Your account and all of its data were deleted.", true);
    clearPageParams();
  } else if (SIGNED_OUT_REASONS[signedOut]) {
    setStatus(SIGNED_OUT_REASONS[signedOut], true);
  }
}
