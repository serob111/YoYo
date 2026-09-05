process.env.NODE_ENV = "test";
process.env.API_PUBLIC_URL = "http://localhost:4000";
process.env.WEB_APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://yoyo:yoyo@localhost:5433/yoyo_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
process.env.SESSION_COOKIE_SECRET = "a".repeat(64);
process.env.EMAIL_FROM_ADDRESS = "no-reply@example.com";
