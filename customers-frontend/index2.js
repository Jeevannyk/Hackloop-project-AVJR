       // Function to show the popup
       function showPopup() {
        // Show the popup
        document.getElementById("overlay").style.display = "flex";  
        setTimeout(() => {
            closePopup();  
            window.location.href = "index.html";  
        }, 3000);
    }

    function closePopup() {
        document.getElementById("overlay").style.display = "none";  // Hide the popup
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
    // Function to redirect to the menu page
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
        const startHour = 9; // 9:00 AM
        const endHour = 22; // 10:00 PM

        if (hours < startHour || hours >= endHour) {
            showInvalidTimePopup();
            return;
        }
        const selecteddate=new Date(document.getElementById('time').value); 
        const currentdate=new Date();
        if(selecteddate<currentdate)
        {
            showpastdatepopup();
            return;

        }

        const orderData = {
            name,
            email,
            phone,
            arrivalTime: arrivalDateTime,
            items: cart,
            totalPrice: total
        };

        try {
            const response = await fetch('http://localhost:5000/api/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Order placed successfully:', result);
                localStorage.removeItem('cart'); 
                localStorage.removeItem('total');
                showPopup();
            } else {
                console.error('Failed to place order');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }
