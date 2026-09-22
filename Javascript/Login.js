// Replace with your actual Cloudflare Worker URL
const API_BASE_URL = 'https://prismal-budget-api.YOUR-SUBDOMAIN.workers.dev';

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
  statusMessage.textContent = ''; // Clear errors on toggle
  
  if (isLoginMode) {
    verifyGroup.style.display = 'none';
    verifyInput.removeAttribute('required');
    primaryBtn.textContent = 'Login';
    toggleBtn.textContent = 'New Account?';
  } else {
    verifyGroup.style.display = 'block';
    verifyInput.setAttribute('required', 'true');
    primaryBtn.textContent = 'Create Account';
    toggleBtn.textContent = 'Back to Login';
  }
});

// 2. Handle form submission (Login or Register)
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusMessage.textContent = '';
  
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

  // Set the endpoint based on the current mode
  const endpoint = isLoginMode ? '/api/login' : '/api/register';
  primaryBtn.disabled = true; // Prevent double-clicks

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      if (isLoginMode) {
        // Save session and redirect to the main app
        localStorage.setItem('prismal_user_id', data.userId);
        localStorage.setItem('prismal_username', data.username);
        window.location.replace("/index.html"); // Redirect to home/dashboard
      } else {
        // Successfully registered! Flip back to login mode automatically
        statusMessage.style.color = '#55ff55'; // Success color
        statusMessage.textContent = "Account created! Please log in.";
        toggleBtn.click(); // Programmatically switch back to login mode
      }
    } else {
      statusMessage.style.color = '#ff5555';
      statusMessage.textContent = data.error || "An error occurred.";
    }
  } catch (err) {
    console.error(err);
    statusMessage.style.color = '#ff5555';
    statusMessage.textContent = "Failed to connect to the server.";
  } finally {
    primaryBtn.disabled = false;
  }
});
