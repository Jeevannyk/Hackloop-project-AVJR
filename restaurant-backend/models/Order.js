const mongoose = require('mongoose');

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
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'pending', enum: ['pending', 'served', 'canceled'] },
    code: { type: Number, required: true }
});

module.exports = mongoose.model('Order', OrderSchema);
