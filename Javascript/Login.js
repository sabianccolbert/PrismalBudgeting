// Replace with your actual Cloudflare Worker URL
const API_BASE_URL = window.location.hostname === '127.0.0.1' 
  ? 'http://127.0.0.1:8787' 
  : 'https://prismal-budget-api.prismalbudget.workers.dev';

const authForm = document.getElementById('auth-form');
const verifyGroup = document.getElementById('verify-password-group');
const verifyInput = document.getElementById('verify-password');
const primaryBtn = document.getElementById('primary-action-btn');
const toggleBtn = document.getElementById('toggle-mode-btn');
const statusMessage = document.getElementById('status-message');

let isLoginMode = true;

// 1. Toggle between Login and Register modes
toggleBtn.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  statusMessage.textContent = '';
  
  if (isLoginMode) {
    // Hide verify password field
    verifyGroup.classList.add('hidden');
    verifyInput.removeAttribute('required');
    primaryBtn.textContent = 'Login';
    toggleBtn.textContent = 'New Account?';
  } else {
    // Show verify password field
    verifyGroup.classList.remove('hidden');
    verifyInput.setAttribute('required', 'true');
    primaryBtn.textContent = 'Create Account';
    toggleBtn.textContent = 'Back to Login';
  }
});

// 2. Handle API Submission
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusMessage.textContent = '';
  statusMessage.style.color = 'var(--LINK_LIGHT)'; // Default to red for errors
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  
  // Registration validation
  if (!isLoginMode) {
    const verifyPass = verifyInput.value;
    if (password !== verifyPass) {
      statusMessage.textContent = "Passwords do not match.";
      return;
    }
    if (password.length < 8) {
      statusMessage.textContent = "Password must be at least 8 characters.";
      return;
    }
  }

  const endpoint = isLoginMode ? '/api/login' : '/api/register';
  primaryBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      if (isLoginMode) {
        // Save session and redirect to home
        localStorage.setItem('prismal_user_id', data.userId);
        localStorage.setItem('prismal_username', data.username);
        
        // Set initial activity timestamp on login
        localStorage.setItem('prismal_last_activity', Date.now().toString());
        
        window.location.replace("/index.html"); 
      } else {
        // Successful registration
        statusMessage.style.color = 'var(--BASE_COLOR)'; // Use neutral gray for success
        statusMessage.textContent = "Account created! Please log in.";
        toggleBtn.click(); // Flip UI back to login mode
      }
    } else {
      statusMessage.textContent = data.error || "An error occurred.";
    }
  } catch (err) {
    console.error(err);
    statusMessage.textContent = "Failed to connect to the server.";
  } finally {
    primaryBtn.disabled = false;
  }
});
