document.addEventListener('DOMContentLoaded', () => {
  // If token is already present, attempt to go straight to dashboard
  if (localStorage.getItem('token')) {
    window.location.href = '/dashboard';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');
  const spinner = document.getElementById('spinner');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = document.getElementById('btnText');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    // Reset styles
    errorBanner.style.display = 'none';
    spinner.style.display = 'inline-block';
    btnSubmit.disabled = true;
    btnText.textContent = 'Authenticating...';

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Incorrect username or password');
      }

      const data = await response.json();
      localStorage.setItem('token', data.access_token);
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      console.error(err);
      errorMessage.textContent = err.message || 'Connection failed. Please try again.';
      errorBanner.style.display = 'flex';
      spinner.style.display = 'none';
      btnSubmit.disabled = false;
      btnText.textContent = 'Sign in';
    }
  });
});
