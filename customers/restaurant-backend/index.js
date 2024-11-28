require('dotenv').config(); // Load environment variables
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const Order = require('./models/Order'); // Import Order model

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
