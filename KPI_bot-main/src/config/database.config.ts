import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  type: process.env.DB_TYPE || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'finco_kpi_bot_db',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'], // Path to entities
  // Schema is owned by migrations (see src/data-source.ts + `npm run migration:*`).
  // synchronize is OFF everywhere to prevent drift; run migrations explicitly.
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? 'all' : ['error'], // Log all queries in dev
  migrationsTableName: 'migrations',
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  // Auto-run pending migrations on boot only when explicitly enabled.
  migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
  extra: {
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
}));
