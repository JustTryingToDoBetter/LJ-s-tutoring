import 'dotenv/config';

process.env.COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'test-cookie-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001';

