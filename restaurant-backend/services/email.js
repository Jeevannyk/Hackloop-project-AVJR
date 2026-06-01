'use strict';

const mailgun = require('mailgun-js');
const logger  = require('../logger');

// Send an order-confirmation email via Mailgun. Fire-and-forget: a failed
// email must never fail the order, so errors are logged but not thrown.
// If Mailgun is not configured, the email is skipped (useful in dev/test).
function sendConfirmationEmail({ name, email, items, totalPrice, arrivalTime, code }) {
    if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
        logger.warn('EMAIL_SKIPPED', { event: 'EMAIL_SKIPPED', reason: 'Mailgun not configured' });
        return;
    }

    const mg    = mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN });
    const lines = items
        .map(i => `${i.name} - Rs.${i.price} x ${i.quantity} = Rs.${(i.price * i.quantity).toFixed(2)}`)
        .join('\n');
    const formatted = new Date(arrivalTime).toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });

    mg.messages().send({
        from:    `Admin@${process.env.MAILGUN_DOMAIN}`,
        to:      email,
        subject: 'Order Confirmation',
        text:    `Hello ${name},\n\nThank you for your order!\n\nItems:\n${lines}\n\nTotal: Rs.${totalPrice}\nPickup: ${formatted}\n\nConfirmation code: ${code}\n\nKeep this code — you will need it at the restaurant.\n\nRegards,\nRestaurant Team`,
    }, (err, body) => {
        if (err) logger.error('EMAIL_FAILED', { event: 'EMAIL_FAILED', error: err.message, to: email });
        else     logger.info('EMAIL_SENT',   { event: 'EMAIL_SENT',   id: body.id, to: email });
    });
}

module.exports = { sendConfirmationEmail };
