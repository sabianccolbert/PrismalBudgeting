const authForm = document.getElementById('auth-form');
const verifyGroup = document.getElementById('verify-password-group');
const verifyInput = document.getElementById('verify-password');
const primaryBtn = document.getElementById('primary-action-btn');
const toggleBtn = document.getElementById('toggle-mode-btn');
const statusMessage = document.getElementById('status-message');

let isLoginMode = true;

toggleBtn.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  statusMessage.textContent = '';
  
  if (isLoginMode) {
    verifyGroup.classList.add('hidden');
    verifyInput.removeAttribute('required');
    primaryBtn.textContent = 'Login';
    toggleBtn.textContent = 'New Account?';
  } else {
    verifyGroup.classList.remove('hidden');
    verifyInput.setAttribute('required', 'true');
    primaryBtn.textContent = 'Create Account';
    toggleBtn.textContent = 'Back to Login';
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusMessage.textContent = '';
  statusMessage.style.color = 'var(--LINK_LIGHT)';
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  
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
    const response = await fetch(`${window.API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      if (isLoginMode) {
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
      } else {
        statusMessage.style.color = 'var(--BASE_COLOR)';
        statusMessage.textContent = "Account created! Please log in.";
        toggleBtn.click();
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