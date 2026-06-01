document.addEventListener('DOMContentLoaded', function () {
    const loginForm    = document.getElementById('loginForm');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const username  = document.getElementById('username').value.trim();
        const password  = document.getElementById('password').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        submitBtn.disabled    = true;
        submitBtn.textContent = 'Signing in…';
        errorMessage.textContent = '';

        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const { token } = await response.json();
                localStorage.setItem('authToken', token);
                window.location.href = 'admin.html';
            } else {
                errorMessage.textContent = 'Invalid username or password.';
            }
        } catch {
            errorMessage.textContent = 'Could not reach the server. Is the backend running?';
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Sign In';
        }
    });
});
