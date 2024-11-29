require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const Order = require('./models/Order'); 

// Validate MongoDB URI
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('MongoDB URI is not defined in .env');
    process.exit(1);
}

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors({ origin: 'http://127.0.0.1:5500' })); // Adjust origin as needed

// Connect to MongoDB
mongoose
    .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    });

    // Get all orders
    app.get('/api/orders', async (req, res) => {
        try {
            // Fetch all orders
            const orders = await Order.find();
    
            // Sort orders by closest arrivalTime to the current time
            const currentTime = new Date();
            orders.sort((a, b) => {
                const timeA = Math.abs(new Date(a.arrivalTime) - currentTime);
                const timeB = Math.abs(new Date(b.arrivalTime) - currentTime);
                return timeA - timeB;
            });
    
            res.status(200).json(orders);
        } catch (error) {
            console.error('Error retrieving orders:', error);
            res.status(500).json({ message: 'Failed to retrieve orders', error });
        }
    });
    

// Update order status
app.patch('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    

    // Validate status
    const validStatuses = ['served', 'canceled', 'pending'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    try {
        const order = await Order.findByIdAndUpdate(id, { status }, { new: true });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.status(200).json({ message: `Order updated to ${status}`, order });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ message: 'Error updating order status', error });
    }
});

// Place a new order
app.post('/api/order', async (req, res) => {
    const { name, email, phone, arrivalTime, items, totalPrice } = req.body;

    // Validate order data
    if (!items || items.length === 0) {
        return res.status(400).json({ message: 'Cart cannot be empty' });
    }

    try {
        const order = new Order({ name, email, phone, arrivalTime, items, totalPrice });
        const newOrder = await order.save();
        res.status(201).json(newOrder);
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ message: 'Failed to place order', error });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
