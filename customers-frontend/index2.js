function showPopup() {
    document.getElementById("overlay").style.display = "flex";
    setTimeout(() => {
        closePopup();
        window.location.href = "index.html";
    }, 3000);
}

function closePopup() {
    document.getElementById("overlay").style.display = "none";
}

function showEmptyCartPopup() {
    document.getElementById("emptyCartOverlay").style.display = "flex";
}

function closeInvalidTimePopup() {
    document.getElementById("invalidTimeOverlay").style.display = "none";
}

function showInvalidTimePopup() {
    document.getElementById("invalidTimeOverlay").style.display = "flex";
}

function showpastdatepopup() {
    document.getElementById("pastdateoverlay").style.display = "flex";
}

function closepastdatepopup() {
    document.getElementById("pastdateoverlay").style.display = "none";
}

function redirectToMenu() {
    window.location.href = "index1.html";
}

function loadCart() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const total = parseFloat(localStorage.getItem('total')) || 0;
    const cartItemsElement = document.getElementById('cart-items');
    const totalPriceElement = document.getElementById('total-price');

    cartItemsElement.innerHTML = '';
    cart.forEach(item => {
        const listItem = document.createElement('li');
        listItem.textContent = `${item.name} - ₹${item.price} x ${item.quantity} = ₹${item.totalPrice.toFixed(2)}`;
        cartItemsElement.appendChild(listItem);
    });
    totalPriceElement.textContent = `Total: ₹${total.toFixed(2)}`;
}

document.addEventListener('DOMContentLoaded', loadCart);

function showNetworkError(msg) {
    const btn = document.querySelector('.order-form .btn');
    const existing = document.getElementById('network-error-msg');
    if (existing) existing.remove();
    const el = document.createElement('p');
    el.id = 'network-error-msg';
    el.textContent = msg;
    el.style.cssText = 'color:#E05050;font-size:0.8125rem;text-align:center;margin-top:0.5rem;';
    btn.insertAdjacentElement('afterend', el);
    setTimeout(() => el.remove(), 6000);
}

async function handleSubmit(event) {
    event.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = '+91 ' + document.getElementById('phone').value;
    const arrivalDateTime = document.getElementById('time').value;
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const total = parseFloat(localStorage.getItem('total') || '0');

    if (cart.length === 0) {
        showEmptyCartPopup();
        return;
    }

    const arrivalDate = new Date(arrivalDateTime);
    const hours = arrivalDate.getHours();

    if (hours < 9 || hours >= 22) {
        showInvalidTimePopup();
        return;
    }

    if (new Date(arrivalDateTime) < new Date()) {
        showpastdatepopup();
        return;
    }

    const orderData = { name, email, phone, arrivalTime: arrivalDateTime, items: cart, totalPrice: total };

    // Include auth token if the user signed in via the QR gateway
    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/order`, {
            method: 'POST',
            headers,
            body: JSON.stringify(orderData),
        });

        if (response.ok) {
            localStorage.removeItem('cart');
            localStorage.removeItem('total');
            showPopup();
        } else {
            const err = await response.json().catch(() => ({}));
            showNetworkError(err.message || 'Order failed. Please try again.');
        }
    } catch (error) {
        showNetworkError('Could not reach the server. Check your connection and try again.');
    }
}
