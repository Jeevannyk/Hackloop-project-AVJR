'use strict';

// Runs once per test file, BEFORE any application module is imported, so the
// config module (which reads process.env at load time) sees a complete, known
// environment. No real .env, database, or Mailgun account is needed.

const bcrypt = require('bcryptjs');

const TEST_ADMIN_PASSWORD = 'CorrectHorse9!';

process.env.NODE_ENV            = 'test';
process.env.ADMIN_USERNAME      = 'admin';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 12);
process.env.ADMIN_JWT_SECRET    = 'test-jwt-secret-not-used-in-production';
process.env.MONGO_URI           = 'mongodb://localhost:27017/restaurant-test';

// Expose the plaintext to test files so the login test can sign in.
process.env.TEST_ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;

// Leave Mailgun unset so the email service short-circuits (and is mocked anyway).
delete process.env.MAILGUN_API_KEY;
delete process.env.MAILGUN_DOMAIN;
