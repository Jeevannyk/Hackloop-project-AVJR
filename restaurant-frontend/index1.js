document.addEventListener('DOMContentLoaded', () => {
    loadMenu();
    loadCartFromStorage();

    // Add event listener for the search bar
    const searchInput = document.getElementById('menu-search');
    searchInput.addEventListener('input', filterMenu);
});

async function loadMenu() {
    try {
        const response = await fetch('menu.json');
        const menuData = await response.json();

        const menuGrid = document.querySelector('.menu-grid');
        menuGrid.innerHTML = ''; // Clear existing menu items

        menuData.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.classList.add('menu-item');
            menuItem.innerHTML = `
                <img src="${item.image}" alt="${item.name}">
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <p class="price">₹${item.price}</p>
                <div class="quantity">
                    <button class="quantity-btn" data-item="${item.name}" data-change="-1">-</button>
                    <input type="number" id="quantity-${item.name}" value="1" min="1" max="20">
                    <button class="quantity-btn" data-item="${item.name}" data-change="1">+</button>
                </div><br>
                <button class="button" data-item="${item.name}" data-price="${item.price}">Add to Cart</button>
            `;
            menuGrid.appendChild(menuItem);
        });

        // Save the full menu data globally for search functionality
        window.fullMenuData = menuData;

        // Attach event listeners for quantity and cart buttons
        menuGrid.addEventListener('click', (event) => {
            if (event.target.classList.contains('quantity-btn')) {
                const itemName = event.target.dataset.item;
                const change = parseInt(event.target.dataset.change, 10);
                changeQuantity(itemName, change);
            } else if (event.target.classList.contains('button')) {
                const itemName = event.target.dataset.item;
                const itemPrice = parseFloat(event.target.dataset.price);
                const quantity = document.getElementById(`quantity-${itemName}`).value;
                addToCart(itemName, itemPrice, quantity);
            }
        });
    } catch (error) {
        console.error('Error loading menu:', error);
    }
}

let cart = [];
let total = 0;

function addToCart(itemName, itemPrice, itemQuantity) {
    itemQuantity = clampQuantity(parseInt(itemQuantity));

    // Check if the item already exists in the cart
    const existingItemIndex = cart.findIndex(item => item.name === itemName);

    if (existingItemIndex === -1) {
        cart.push({
            name: itemName,
            price: itemPrice,
            quantity: itemQuantity,
            totalPrice: itemQuantity * itemPrice
        });
        total += itemQuantity * itemPrice;
        saveCartToStorage();
        displayCart();
    } else {
        alert(`${itemQuantity} ${itemName} are added to cart.`);
        setTimeout(() => {
            document.getElementById('cart').scrollIntoView({ behavior: 'smooth' });
        }, 0);
    }
}

function changeQuantity(itemName, change) {
    const quantityInput = document.getElementById(`quantity-${itemName}`);
    let newQuantity = clampQuantity(parseInt(quantityInput.value) + change);
    quantityInput.value = newQuantity;
    updateCartItem(itemName, newQuantity);
}

function updateCartItem(itemName, newQuantity) {
    const itemIndex = cart.findIndex(item => item.name === itemName);

    if (itemIndex !== -1) {
        cart[itemIndex].quantity = newQuantity;
        cart[itemIndex].totalPrice = newQuantity * cart[itemIndex].price;
        total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
        saveCartToStorage();
        displayCart();
    }
}

function displayCart() {
    const cartItemsElement = document.getElementById('cart-items');
    cartItemsElement.innerHTML = '';

    cart.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = `${item.name} - ₹${item.price} x ${item.quantity} = ₹${item.totalPrice.toFixed(2)}`;

        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.classList.add('button');
        removeButton.onclick = () => removeFromCart(index);
        
        listItem.appendChild(removeButton);
        cartItemsElement.appendChild(listItem);
    });

    document.getElementById('total-price').textContent = `Total: ₹${total.toFixed(2)}`;
}

function removeFromCart(index) {
    total -= cart[index].totalPrice;
    cart.splice(index, 1);
    saveCartToStorage();
    displayCart();
}

function clampQuantity(quantity) {
    return Math.max(1, Math.min(20, quantity));
}

function saveCartToStorage() {
    localStorage.setItem('cart', JSON.stringify(cart));
    localStorage.setItem('total', total);
}

function loadCartFromStorage() {
    const savedCart = JSON.parse(localStorage.getItem('cart'));
    const savedTotal = parseFloat(localStorage.getItem('total'));

    if (savedCart && savedTotal) {
        cart = savedCart;
        total = savedTotal;
    }
    displayCart();
}

/** Filter the menu items based on search input */
function filterMenu(event) {
    const searchQuery = event.target.value.toLowerCase();
    const menuGrid = document.querySelector('.menu-grid');

    const filteredMenu = window.fullMenuData.filter(item =>
        item.name.toLowerCase().includes(searchQuery) || 
        item.description.toLowerCase().includes(searchQuery)
    );

    menuGrid.innerHTML = '';
    if (filteredMenu.length > 0) {
        filteredMenu.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.classList.add('menu-item');
            menuItem.innerHTML = `
                <img src="${item.image}" alt="${item.name}">
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <p class="price">₹${item.price}</p>
                <div class="quantity">
                    <button class="quantity-btn" data-item="${item.name}" data-change="-1">-</button>
                    <input type="number" id="quantity-${item.name}" value="1" min="1" max="20">
                    <button class="quantity-btn" data-item="${item.name}" data-change="1">+</button>
                </div><br>
                <button class="button" data-item="${item.name}" data-price="${item.price}">Add to Cart</button>
            `;
            menuGrid.appendChild(menuItem);
        });
    } else {
        menuGrid.innerHTML = `<p class="no-results">No items found. Try different keywords.</p>`;
    }
}
function changeQuantity(itemName, change) {
    const quantityInput = document.getElementById(`quantity-${itemName}`);
    const currentQuantity = parseInt(quantityInput.value);
    const newQuantity = clampQuantity(currentQuantity + change);

    // Update the quantity input field
    quantityInput.value = newQuantity;

    // Trigger the floating animation if the quantity changes
    if (currentQuantity !== newQuantity) {
        const button = event.target; // The button that was clicked
        triggerFloatingNumber(button, change > 0 ? '+1' : '-1');
    }

    // Update the cart item
    updateCartItem(itemName, newQuantity);
}

/** Function to create a floating number animation */
function triggerFloatingNumber(button, text) {
    // Get the button's position on the page
    const rect = button.getBoundingClientRect();

    // Create the floating number element
    const floatingNumber = document.createElement('span');
    floatingNumber.classList.add('floating-number');
    floatingNumber.textContent = text;

    // Position the floating number near the button
    floatingNumber.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
    floatingNumber.style.top = `${rect.top + window.scrollY}px`;

    // Append the floating number to the body
    document.body.appendChild(floatingNumber);

    // Remove the floating number after the animation ends
    setTimeout(() => {
        floatingNumber.remove();
    }, 500); // Match the duration of the CSS animation
}
