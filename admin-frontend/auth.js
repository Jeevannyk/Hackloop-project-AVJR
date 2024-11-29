document.addEventListener('DOMContentLoaded', function() {
    if (!localStorage.getItem('authToken')) {
        // Redirect to login page if not authenticated
        window.location.href = 'login.html';
    }
});
