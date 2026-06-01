'use strict';

document.addEventListener('DOMContentLoaded', () => {
    loadMenu();
    loadCartFromStorage();
    document.getElementById('menu-search').addEventListener('input', filterMenu);
});

// ── Menu rendering ────────────────────────────────────────────────────────────

// Builds a menu card using DOM APIs — no innerHTML interpolation, no XSS risk.
function renderMenuItem(item) {
    const el = document.createElement('div');
    el.className = 'menu-item';

    const img = document.createElement('img');
    img.src = item.image;
    img.alt = item.name;

    const h3 = document.createElement('h3');
    h3.textContent = item.name;

    const desc = document.createElement('p');
    desc.textContent = item.description;

    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = `₹${item.price}`;

    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'quantity';

    const btnMinus = document.createElement('button');
    btnMinus.className = 'quantity-btn';
    btnMinus.dataset.item = item.name;
    btnMinus.dataset.change = '-1';
    btnMinus.textContent = '-';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.id = `quantity-${item.name}`;
    qtyInput.value = '1';
    qtyInput.min = '1';
    qtyInput.max = '20';

    const btnPlus = document.createElement('button');
    btnPlus.className = 'quantity-btn';
    btnPlus.dataset.item = item.name;
    btnPlus.dataset.change = '1';
    btnPlus.textContent = '+';

    qtyWrap.append(btnMinus, qtyInput, btnPlus);

    const addBtn = document.createElement('button');
    addBtn.className = 'button';
    addBtn.dataset.item = item.name;
    addBtn.dataset.price = item.price;
    addBtn.textContent = 'Add to Cart';

    el.append(img, h3, desc, price, qtyWrap, addBtn);
    return el;
}

async function loadMenu() {
    try {
        const res = await fetch(`${CONFIG.API_BASE}/api/menu`);
        const menuData = await res.json();
        window.fullMenuData = menuData;

        const grid = document.querySelector('.menu-grid');
        grid.innerHTML = '';
        menuData.forEach(item => grid.appendChild(renderMenuItem(item)));

        grid.addEventListener('click', handleMenuClick);
    } catch (err) {
        console.error('Error loading menu:', err);
    }
}

function filterMenu(event) {
    const query = event.target.value.toLowerCase();
    const grid = document.querySelector('.menu-grid');
    const matches = window.fullMenuData.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    );

    grid.innerHTML = '';
    if (matches.length > 0) {
        matches.forEach(item => grid.appendChild(renderMenuItem(item)));
    } else {
        const msg = document.createElement('p');
        msg.className = 'no-results';
        msg.textContent = 'No items found. Try different keywords.';
        grid.appendChild(msg);
    }
}

// Single delegated click handler — no duplicate listener registration.
function handleMenuClick(event) {
    if (event.target.classList.contains('quantity-btn')) {
        const itemName = event.target.dataset.item;
        const change   = parseInt(event.target.dataset.change, 10);
        changeQuantity(itemName, change, event.target);
    } else if (event.target.classList.contains('button')) {
        const itemName  = event.target.dataset.item;
        const itemPrice = parseFloat(event.target.dataset.price);
        const quantity  = document.getElementById(`quantity-${itemName}`).value;
        addToCart(itemName, itemPrice, quantity);
    }
}

// ── Quantity ──────────────────────────────────────────────────────────────────

function changeQuantity(itemName, change, button) {
    const input = document.getElementById(`quantity-${itemName}`);
    const prev  = parseInt(input.value);
    const next  = clampQuantity(prev + change);
    input.value = next;
    if (prev !== next) triggerFloatingNumber(button, change > 0 ? '+1' : '-1');
    updateCartItem(itemName, next);
}

function clampQuantity(n) {
    return Math.max(1, Math.min(20, n));
}

function triggerFloatingNumber(button, text) {
    const rect = button.getBoundingClientRect();
    const el   = document.createElement('span');
    el.className = 'floating-number';
    el.textContent = text;
    el.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
    el.style.top  = `${rect.top  + window.scrollY}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
}

// ── Cart ──────────────────────────────────────────────────────────────────────

let cart  = [];
let total = 0;

function addToCart(itemName, itemPrice, itemQuantity) {
    itemQuantity = clampQuantity(parseInt(itemQuantity));
    const existing = cart.findIndex(i => i.name === itemName);

    if (existing === -1) {
        cart.push({ name: itemName, price: itemPrice, quantity: itemQuantity, totalPrice: itemQuantity * itemPrice });
        total += itemQuantity * itemPrice;
        saveCartToStorage();
        displayCart();
    } else {
        alert(`${itemName} is already in your cart.`);
        setTimeout(() => document.getElementById('cart').scrollIntoView({ behavior: 'smooth' }), 0);
    }
}

function updateCartItem(itemName, newQuantity) {
    const idx = cart.findIndex(i => i.name === itemName);
    if (idx !== -1) {
        cart[idx].quantity   = newQuantity;
        cart[idx].totalPrice = newQuantity * cart[idx].price;
        total = cart.reduce((sum, i) => sum + i.totalPrice, 0);
        saveCartToStorage();
        displayCart();
    }
}

function removeFromCart(index) {
    total -= cart[index].totalPrice;
    cart.splice(index, 1);
    saveCartToStorage();
    displayCart();
}

function displayCart() {
    const list = document.getElementById('cart-items');
    list.innerHTML = '';
    cart.forEach((item, index) => {
        const li = document.createElement('li');
        li.textContent = `${item.name} - ₹${item.price} × ${item.quantity} = ₹${item.totalPrice.toFixed(2)}`;
        const btn = document.createElement('button');
        btn.textContent = 'Remove';
        btn.className = 'button';
        btn.onclick = () => removeFromCart(index);
        li.appendChild(btn);
        list.appendChild(li);
    });
    document.getElementById('total-price').textContent = `Total: ₹${total.toFixed(2)}`;
}

function saveCartToStorage() {
    localStorage.setItem('cart',  JSON.stringify(cart));
    localStorage.setItem('total', String(total));
}

function loadCartFromStorage() {
    const savedCart  = JSON.parse(localStorage.getItem('cart'));
    const savedTotal = parseFloat(localStorage.getItem('total'));
    if (savedCart && savedTotal) { cart = savedCart; total = savedTotal; }
    displayCart();
}
