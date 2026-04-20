import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  databaseUrl: process.env['DATABASE_URL'] ?? 'postgresql://postgres:root@localhost:5432/workflow_management',
  jwt: {
    secret: process.env['JWT_SECRET'] ?? 'DEMO_SECRETS',
    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '24h',
  },
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  bcryptRounds: parseInt(process.env['BCRYPT_ROUNDS'] ?? '10', 10),
} as const;
