import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

/**
 * Single source of truth for the TypeORM CLI (migrations).
 * Uses the same DB_* env vars as the runtime app (src/config/database.config.ts).
 * The __dirname-relative globs resolve correctly under both ts-node (src) and
 * the compiled build (dist).
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'finco_kpi_bot_db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
  extra: {
    ssl:
      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
});

export default AppDataSource;
