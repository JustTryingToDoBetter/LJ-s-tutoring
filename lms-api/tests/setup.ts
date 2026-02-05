import 'dotenv/config';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
if (!process.env.DATABASE_URL_TEST) {
	throw new Error('DATABASE_URL_TEST must be set for tests');
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

process.env.COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'test-cookie-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001';

