/**
 * One-time setup: hash the admin password and print the env line to paste into .env
 *
 * Usage:
 *   node scripts/setup-admin.js
 *   (prompts for password, prints ADMIN_PASSWORD_HASH=... to stdout)
 *
 * Then append the output line to your .env file.
 * Never store the plaintext password anywhere.
 */
const bcrypt   = require('bcryptjs');
const readline = require('readline');
const crypto   = require('crypto');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Hide typed characters
function promptSecret(question) {
    return new Promise(resolve => {
        process.stdout.write(question);
        const stdin = process.openStdin();
        process.stdin.setRawMode?.(true);
        let password = '';
        process.stdin.on('data', chunk => {
            const ch = chunk.toString();
            if (ch === '\r' || ch === '\n') {
                process.stdin.setRawMode?.(false);
                process.stdout.write('\n');
                resolve(password);
            } else if (ch === '') {
                process.exit();
            } else if (ch === '') {
                password = password.slice(0, -1);
            } else {
                password += ch;
                process.stdout.write('*');
            }
        });
    });
}

(async () => {
    const password = await promptSecret('Enter new admin password: ');
    rl.close();

    if (password.length < 12) {
        console.error('\nPassword must be at least 12 characters.');
        process.exit(1);
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        console.error('\nPassword must contain uppercase, a digit, and a special character.');
        process.exit(1);
    }

    const hash   = await bcrypt.hash(password, 12);
    const secret = crypto.randomBytes(32).toString('hex');

    console.log('\nPaste these lines into your restaurant-backend/.env:\n');
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
    console.log(`ADMIN_JWT_SECRET=${secret}`);
    console.log('\nDone. The plaintext password is not stored anywhere.');
})();
