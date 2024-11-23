const dotenv = require('dotenv'); // Load dotenv to access environment variables
dotenv.config(); // Load variables from the .env file

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const Order = require('./models/Order');

if (!process.env.MONGO_URI) {
    console.error('MongoDB URI is not defined in .env');
    process.exit(1); // Stop the server if the URI is not found
}

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Connect to MongoDB Atlas using the URI stored in environment variables
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Failed to connect to MongoDB:", err));

// Define a POST route to handle order submissions
app.post('/api/order', async (req, res) => {
    const { name, email, phone, arrivalTime, items, totalPrice } = req.body; // Ensure phone is included

    // Validate if there are items in the cart
    if (!items || items.length === 0) {
        return res.status(400).json({ message: 'A cart cannot be empty' }); // Respond with error if cart is empty
    }

    const order = new Order({
        name,
        email,
        phone, // Include phone number
        arrivalTime,
        items,
        totalPrice
    });

    try {
        // Save the order to the database
        const newOrder = await order.save();
        res.status(201).json(newOrder); // Respond with the created order
    } catch (error) {
        res.status(500).json({ message: 'Failed to place order', error }); // Handle server errors
    }
});

// Route to fetch all orders for admin view
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find(); // Fetch all orders from the database
        res.status(200).json(orders); // Respond with the orders
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve orders', error }); // Handle errors
    }
});

const path = require('path');

// Serve the admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
