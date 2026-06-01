'use strict';

let allOrders      = [];
let searchTimeout;
const { jsPDF }    = window.jspdf;
let isMessageShown = false;
let hideMessageTimeout;

// ── Session guard ─────────────────────────────────────────────────────────────
function decodeAdminToken(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}
function isAdminSessionValid(token) {
    if (!token) return false;
    const p = decodeAdminToken(token);
    return p?.role === 'admin' && p.exp * 1000 > Date.now();
}
function adminHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('authToken') };
}
function handleAuthFailure() {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    if (!isAdminSessionValid(localStorage.getItem('authToken'))) {
        handleAuthFailure();
        return;
    }
    fetchOrders();
});

document.getElementById('logoutButton').addEventListener('click', handleAuthFailure);

// ── Orders ────────────────────────────────────────────────────────────────────
async function fetchOrders() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/orders`, {
            headers: { 'x-admin-token': localStorage.getItem('authToken') },
        });
        if (response.status === 401) { handleAuthFailure(); return; }
        if (!response.ok) throw new Error('Network error');
        allOrders = await response.json();
        filterOrders();
    } catch (err) {
        console.error('[admin] fetchOrders error:', err);
    }
}


// Filter orders based on status and search query
function filterOrders() {
    const statusFilterElement = document.getElementById('statusFilter');
    const searchInputElement = document.getElementById('searchInput');

    if (!statusFilterElement || !searchInputElement) {
        console.error('One or more elements are missing from the DOM');
        return;
    }

    const filterValue = statusFilterElement.value;
    const searchQuery = searchInputElement.value.toLowerCase();
    const currentTime = new Date();

    let filteredOrders = filterValue === 'all' ? allOrders : allOrders.filter(order => order.status === filterValue);

    if (searchQuery) {
        filteredOrders = filteredOrders.filter(order =>
            order.name.toLowerCase().includes(searchQuery) ||
            order.email.toLowerCase().includes(searchQuery) ||
            order.phone.includes(searchQuery) ||
            order.code.toString().includes(searchQuery)

        );
    }

    // Sort orders based on the closest arrivalTime to the current time
    filteredOrders.sort((a, b) => {
        const timeA = Math.abs(new Date(a.arrivalTime) - currentTime);
        const timeB = Math.abs(new Date(b.arrivalTime) - currentTime);
        return timeA - timeB;
    });

    console.log('Filtered Orders:', filteredOrders);
    renderOrders(filteredOrders);
}



// Function to render orders
function renderOrders(orders) {
    const tableBody = document.getElementById('ordersTableBody');
    const noResultsMessage = document.getElementById('noResultsMessage');
    tableBody.innerHTML = ''; 

    if (orders.length === 0) {
        if (!isMessageShown) {
            
            if (!noResultsMessage) {
                const messageElement = document.createElement('tr');
                messageElement.id = 'noResultsMessage';
                messageElement.innerHTML = `<td colspan="9" style="text-align: center; color: #f44336; font-weight: bold;">Try different keywords</td>`;
                tableBody.appendChild(messageElement);
            }
            isMessageShown = true;

            if (hideMessageTimeout) {
                clearTimeout(hideMessageTimeout); 
            }
            hideMessageTimeout = setTimeout(() => {
                hideMessage();
            }, 3000); 
        }
    } else {
        if (noResultsMessage) {
            noResultsMessage.remove();
        }
        isMessageShown = false; 
    }

    // Render orders
    orders.forEach((order, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${order.code}</td>
            <td class="name">${order.name}</td>
            <td>${order.email}</td>
            <td class="phone">${order.phone}</td>
            <td class="date">${new Date(order.arrivalTime).toLocaleString()}</td>
            <td class="items">${renderItems(order.items)}</td>
            <td>₹${order.totalPrice.toFixed(2)}</td>
            <td class="date">${new Date(order.createdAt).toLocaleString()}</td>
            <td id="action-${order._id}">
                <div class="button-container">
                    ${renderActionButtons(order)}
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Function to render items
function renderItems(items) {
    return items.map(item => `${item.name} (x${item.quantity})`).join(', ');
}

// Function to render action buttons
function renderActionButtons(order) {
    if (order.status === 'pending') {
        return ` 
            <button class="button served" onclick="updateOrderStatus('${order._id}', 'served')">Order Served</button>
            <button class="button canceled" onclick="updateOrderStatus('${order._id}', 'canceled')">Order Canceled</button>
        `;
    } else {
        return ` 
            ${order.status === 'served' ? 'Order Served' : 'Order Canceled'}
            <button class="button reset" onclick="resetOrderStatus('${order._id}')">Undo</button>
        `;
    }
}

// Function to update the status of an order
async function updateOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) {
            throw new Error('Failed to update order status');
        }

        const result = await response.json();
        const updatedOrder = result.order;  

        if (!updatedOrder || !updatedOrder._id) {
            console.error('Updated order does not have an _id:', updatedOrder);
            alert('Error: Order update failed.');
            return;
        }
        const orderRow = document.getElementById(`action-${updatedOrder._id}`);
        if (orderRow) {
            orderRow.innerHTML = renderActionButtons(updatedOrder); 
        } else {
            console.error(`Order row with ID 'action-${updatedOrder._id}' not found`);
                fetchOrders();
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        alert(error.message); 
    }
}

// Function to reset the status of an order (Undo action)
async function resetOrderStatus(orderId) {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'pending' }),
        });

        if (!response.ok) {
            throw new Error('Failed to reset order status');
        }

        const result = await response.json();
        const updatedOrder = result.order;  
        if (!updatedOrder || !updatedOrder._id) {
            console.error('Updated order does not have an _id:', updatedOrder);
            alert('Error: Order update failed.');
            return;
        }
        const orderRow = document.getElementById(`action-${updatedOrder._id}`);
        if (orderRow) {
            orderRow.innerHTML = renderActionButtons(updatedOrder);
        } else {
            console.error(`Order row with ID 'action-${updatedOrder._id}' not found`);
            fetchOrders(); 
        }
    } catch (error) {
        console.error('Error resetting order status:', error);
        alert(error.message); 
    }
}
// Function to check if the order was created today
function isOrderToday(order) {
    const today = new Date();
    const orderDate = new Date(order.createdAt);
    return today.toDateString() === orderDate.toDateString();
}


// Function to show the popup with selected date or month summary
function showPopup() {
    const selectedDate = document.getElementById('datePicker').value;
    const selectedMonth = document.getElementById('monthPicker').value;

    let selectedDateText = "Today";  
    let filteredOrders;

    if (selectedDate) {
        filteredOrders = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt);
            return orderDate.toLocaleDateString() === new Date(selectedDate).toLocaleDateString();
        });
        const orderDate = new Date(selectedDate);
        selectedDateText = orderDate.toLocaleDateString();
    } else if (selectedMonth) {
        filteredOrders = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt);
            return orderDate.getFullYear() === parseInt(selectedMonth.split("-")[0]) &&
                   orderDate.getMonth() === parseInt(selectedMonth.split("-")[1]) - 1;
        });
        const monthDate = new Date(selectedMonth + "-01");
        selectedDateText = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    } else {
        filteredOrders = allOrders.filter(order => isOrderToday(order));
        const today = new Date();
        selectedDateText = today.toLocaleDateString();
    }

    document.getElementById('selectedDate').textContent = selectedDateText;
    const totalOrders = filteredOrders.length;
    const servedOrders = filteredOrders.filter(order => order.status === 'served').length;
    const canceledOrders = filteredOrders.filter(order => order.status === 'canceled').length;

    // Calculate total earnings for only served orders
    const totalEarnings = filteredOrders
        .filter(order => order.status === 'served')
        .reduce((total, order) => total + order.totalPrice, 0);
    
    const servedItems = filteredOrders
        .filter(order => order.status === 'served')
        .reduce((items, order) => {
            order.items.forEach(item => {
                const existingItem = items.find(i => i.name === item.name);
                if (existingItem) {
                    existingItem.quantity += item.quantity;
                } else {
                    items.push({ ...item });
                }
            });
            return items;
        }, []);

    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('servedOrders').textContent = servedOrders;
    document.getElementById('canceledOrders').textContent = canceledOrders;
    document.getElementById('totalEarnings').textContent = totalEarnings.toFixed(2);

    const servedItemsList = document.getElementById('servedItemsList');
    servedItemsList.innerHTML = '';
    servedItems.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.name} (x${item.quantity})`;
        servedItemsList.appendChild(li);
    });

    document.getElementById('overlay').style.display = 'block';
    document.getElementById('popup').style.display = 'block';
}


function hidePopup() {
    console.log('Hiding popup'); 
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('popup').style.display = 'none';
}


function generatePDFReport() {
    const selectedDate = document.getElementById('datePicker').value;
    const selectedMonth = document.getElementById('monthPicker').value;

    let filteredOrders;

    if (selectedDate) {
        filteredOrders = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt);
            return orderDate.toLocaleDateString() === new Date(selectedDate).toLocaleDateString();
        });
    } else if (selectedMonth) {
        filteredOrders = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt);
            return orderDate.getFullYear() === parseInt(selectedMonth.split("-")[0]) &&
                   orderDate.getMonth() === parseInt(selectedMonth.split("-")[1]) - 1;
        });
    } else {
        filteredOrders = allOrders.filter(order => isOrderToday(order));
    }

    const totalOrders = filteredOrders.length;
    const servedOrders = filteredOrders.filter(order => order.status === 'served').length;
    const canceledOrders = filteredOrders.filter(order => order.status === 'canceled').length;
    const totalEarnings = filteredOrders
        .filter(order => order.status === 'served')
        .reduce((total, order) => total + order.totalPrice, 0);

    // Aggregate served items
    const servedItems = filteredOrders
        .filter(order => order.status === 'served')
        .reduce((items, order) => {
            order.items.forEach(item => {
                const existingItem = items.find(i => i.name === item.name);
                if (existingItem) {
                    existingItem.quantity += item.quantity;
                } else {
                    items.push({ ...item });
                }
            });
            return items;
        }, []);

    const doc = new jsPDF();
    doc.addFont('path-to-font/FreeSerif.ttf', 'FreeSerif', 'normal'); 
    doc.setFont('FreeSerif');

    doc.setFontSize(18);
    doc.text('Order Summary Report', 20, 20);

    let selectedDateText;  
    if (selectedDate) {
        const orderDate = new Date(selectedDate);
        selectedDateText = orderDate.toLocaleDateString();
    } else if (selectedMonth) {
        const monthDate = new Date(selectedMonth + "-01");
        selectedDateText = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    } else {
        const today = new Date();
        selectedDateText = today.toLocaleDateString(); 
    }
    

    doc.setFontSize(14);
    doc.text(`Selected Date: ${selectedDateText}`, 20, 30);

    doc.setFontSize(12);
    doc.text(`Total Orders: ${totalOrders}`, 20, 40);
    doc.text(`Orders Served: ${servedOrders}`, 20, 50);
    doc.text(`Orders Canceled: ${canceledOrders}`, 20, 60);
    doc.text(`Total Earnings: ${totalEarnings.toFixed(2)}`, 20, 70);

    doc.text('Served Items:', 20, 80);
    let yOffset = 90;
    servedItems.forEach((item, index) => {
        doc.text(`${index + 1}. ${item.name} (x${item.quantity})`, 20, yOffset);
        yOffset += 10;
    });

    doc.save('order_summary.pdf');
}

function hideMessage() {
    const noResultsMessage = document.getElementById('noResultsMessage');
    if (noResultsMessage) {
        noResultsMessage.remove();
    }
    isMessageShown = false;
}

// Add debounce to the search input
document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function () {
        filterOrders(); 
    }, 500); 
});

function exportOrdersToPDF() {
    const doc = new jsPDF();
    const orders = allOrders;

    console.log('All Orders:', orders);

    if (orders.length === 0) {
        alert("No orders available to export.");
        return;
    }

    const groupedOrders = groupOrdersByStatus(orders);
    console.log('Grouped Orders by Status:', groupedOrders);

    doc.setFontSize(18);
    doc.text("Order Report", 20, 20);

    let yPosition = 30;
    const lineMargin = 5;

    const pageHeight = doc.internal.pageSize.height; 
    const maxY = pageHeight - 30; 

    doc.addFont('path-to-font/Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.setFont('Roboto');
    

    // Loop through each status group (e.g., "Pending", "Served", "Canceled")
    for (let status in groupedOrders) {
        const statusOrders = groupedOrders[status];

        console.log(`Orders in ${status} group:`, statusOrders);

        if (yPosition > maxY) {
            doc.addPage(); 
            yPosition = 20;
        }

        doc.setFontSize(14);
        doc.text(`${status.charAt(0).toUpperCase() + status.slice(1)} Orders`, 20, yPosition);
        yPosition += lineMargin + 10; 
        const groupedByDate = groupOrdersByDate(statusOrders);

        console.log(`Grouped by Date for ${status}:`, groupedByDate);

        for (let date in groupedByDate) {
            const dateOrders = groupedByDate[date];

            console.log(`Orders on ${date}:`, dateOrders);

            if (yPosition > maxY) {
                doc.addPage(); 
                yPosition = 20; 
            }

            doc.setFontSize(12);
            doc.text(`Date: ${date}`, 20, yPosition);
            yPosition += lineMargin + 5; 
            dateOrders.forEach((order, index) => {
                if (yPosition > maxY) {
                    doc.addPage(); 
                    yPosition = 20; 
                }

                doc.setFontSize(10);
                doc.text(`Order #${index + 1}`, 20, yPosition);
                doc.text(`Name: ${order.name}`, 20, yPosition + 6);
                doc.text(`Email: ${order.email}`, 20, yPosition + 12);
                doc.text(`Phone: ${order.phone}`, 20, yPosition + 18);
                doc.text(`Total Price: ${order.totalPrice.toFixed(2)}`, 20, yPosition + 24); 
                doc.text(`Arrival Time: ${new Date(order.arrivalTime).toLocaleString()}`, 20, yPosition + 30);
                
                yPosition += 40; 
                doc.text("--------------------------------------------------------", 20, yPosition); 
                yPosition += 5; 
            });

            yPosition += 10; 
        }
    }

    // Save the PDF
    doc.save("orders_report.pdf");
}

// Function to group orders by status
function groupOrdersByStatus(orders) {
    return orders.reduce((grouped, order) => {
        if (!grouped[order.status]) {
            grouped[order.status] = [];
        }
        grouped[order.status].push(order);
        return grouped;
    }, {});
}

// Function to group orders by date
function groupOrdersByDate(orders) {
    return orders.reduce((grouped, order) => {
        const date = new Date(order.createdAt).toLocaleDateString();
        if (!grouped[date]) {
            grouped[date] = [];
        }
        grouped[date].push(order);
        return grouped;
    }, {});
}



// Refresh every 30 seconds
setInterval(fetchOrders, 30000);

// ═══════════════════════════════════════════════════════
//  TAB SWITCHING
// ═══════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('tab-active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
        if (btn.dataset.tab === 'menu') loadMenu();
    });
});

// ═══════════════════════════════════════════════════════
//  MENU MANAGER
// ═══════════════════════════════════════════════════════
let selectedImageFile = null;

async function loadMenu() {
    const grid = document.getElementById('menuGrid');
    grid.innerHTML = '<p class="menu-loading">Loading…</p>';
    try {
        const res  = await fetch(`${CONFIG.API_BASE}/api/menu`);
        const items = await res.json();
        document.getElementById('menuCount').textContent = `(${items.length})`;
        grid.innerHTML = '';
        if (items.length === 0) {
            grid.innerHTML = '<p class="menu-loading">No items yet. Add one above.</p>';
            return;
        }
        items.forEach(item => grid.appendChild(renderMenuCard(item)));
    } catch (err) {
        grid.innerHTML = '<p class="menu-loading" style="color:var(--red)">Failed to load menu.</p>';
        console.error('[admin] loadMenu error:', err);
    }
}

function renderMenuCard(item) {
    const card = document.createElement('div');
    card.className = 'menu-admin-card';
    card.dataset.id = item._id;

    const img = document.createElement('img');
    // Seeded items have relative paths — prefix with customer frontend origin when needed
    img.src = item.image.startsWith('http') ? item.image : `../customers-frontend/${item.image}`;
    img.alt = item.name;
    img.className = 'menu-admin-img';

    const info = document.createElement('div');
    info.className = 'menu-admin-info';

    const name = document.createElement('p');
    name.className = 'menu-admin-name';
    name.textContent = item.name;

    const desc = document.createElement('p');
    desc.className = 'menu-admin-desc';
    desc.textContent = item.description;

    const price = document.createElement('p');
    price.className = 'menu-admin-price';
    price.textContent = `₹${item.price}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'menu-del-btn';
    delBtn.textContent = 'Remove';
    delBtn.onclick = () => deleteMenuItem(item._id, card);

    info.append(name, desc, price, delBtn);
    card.append(img, info);
    return card;
}

async function deleteMenuItem(id, cardEl) {
    if (!confirm('Remove this item from the menu?')) return;
    const token = localStorage.getItem('authToken');
    try {
        const res = await fetch(`${CONFIG.API_BASE}/api/menu/${id}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': token },
        });
        if (!res.ok) throw new Error((await res.json()).message);
        cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
        cardEl.style.opacity = '0';
        cardEl.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardEl.remove();
            const grid  = document.getElementById('menuGrid');
            const count = grid.querySelectorAll('.menu-admin-card').length;
            document.getElementById('menuCount').textContent = `(${count})`;
            if (count === 0) grid.innerHTML = '<p class="menu-loading">No items. Add one above.</p>';
        }, 300);
    } catch (err) {
        alert('Failed to remove item: ' + err.message);
    }
}

// ── Drop zone / image preview ─────────────────────────────────────────────────
const dropZone    = document.getElementById('dropZone');
const imageInput  = document.getElementById('imageInput');
const imgPreview  = document.getElementById('imgPreview');
const placeholder = document.getElementById('dropPlaceholder');

dropZone.addEventListener('click', () => imageInput.click());

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drop-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drop-over');
    const file = e.dataTransfer.files[0];
    if (file) applyImagePreview(file);
});

imageInput.addEventListener('change', () => {
    if (imageInput.files[0]) applyImagePreview(imageInput.files[0]);
});

function applyImagePreview(file) {
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        imgPreview.src = e.target.result;
        imgPreview.classList.remove('hidden');
        placeholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

// ── Add item form submit ───────────────────────────────────────────────────────
document.getElementById('addItemForm').addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = document.getElementById('addItemStatus');
    const addBtn   = document.getElementById('addItemBtn');

    if (!selectedImageFile) {
        showAddStatus('Please add a food photo first.', 'error');
        return;
    }

    const name  = document.getElementById('itemName').value.trim();
    const price = document.getElementById('itemPrice').value.trim();
    const desc  = document.getElementById('itemDesc').value.trim();

    const formData = new FormData();
    formData.append('image',       selectedImageFile);
    formData.append('name',        name);
    formData.append('price',       price);
    formData.append('description', desc);

    addBtn.disabled    = true;
    addBtn.textContent = 'Adding…';
    showAddStatus('', '');

    try {
        const token = localStorage.getItem('authToken');
        const res   = await fetch(`${CONFIG.API_BASE}/api/menu`, {
            method:  'POST',
            headers: { 'x-admin-token': token },
            body:    formData,
        });
        if (!res.ok) throw new Error((await res.json()).message);

        showAddStatus('Dish added to the menu!', 'success');
        e.target.reset();
        selectedImageFile = null;
        imgPreview.src = '';
        imgPreview.classList.add('hidden');
        placeholder.classList.remove('hidden');
        loadMenu();
    } catch (err) {
        showAddStatus('Failed: ' + err.message, 'error');
    } finally {
        addBtn.disabled    = false;
        addBtn.textContent = 'Add to Menu';
    }
});

function showAddStatus(msg, type) {
    const el = document.getElementById('addItemStatus');
    el.textContent = msg;
    el.className   = `add-status ${type}`;
    el.classList.toggle('hidden', !msg);
}
