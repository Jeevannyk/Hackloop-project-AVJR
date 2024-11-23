const mongoose = require('mongoose');

// Define the schema for an order
const OrderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    arrivalTime: { type: Date, required: true },
    items: [
        {
            name: { type: String, required: true },
            quantity: { type: Number, required: true, min: 1 },
            price: { type: Number, required: true, min: 0 }
        }
    ],
    totalPrice: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Add a custom validator to prevent empty carts
OrderSchema.path('items').validate(function (items) {
    return items.length > 0; // Ensure that there is at least one item in the array
}, 'A cart cannot be empty');

// Export the model
module.exports = mongoose.model('Order', OrderSchema);
