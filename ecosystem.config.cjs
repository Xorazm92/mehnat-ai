/**
 * PM2 process manifest for ASRO — the Next.js web app and the Telegram bot
 * worker. Both read secrets from the shell / .env (systemd-style EnvironmentFile
 * or `pm2 start --update-env`); keep real secrets OUT of this file.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs --update-env   # zero-downtime reload after deploy
 *   pm2 logs asro-web
 *   pm2 save && pm2 startup                         # persist across reboots
 */
module.exports = {
  apps: [
    {
      name: "asro-web",
      // Run the Next.js production server directly (npm wrappers confuse PM2 signals).
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "700M",
      env: { NODE_ENV: "production", PORT: "3000" },
    },
    {
      // The bot worker owns an in-process cron (bot/cron/scheduler.ts), so it
      // MUST stay a SINGLE instance — two would double-run the deadline sweep.
      name: "asro-bot",
      script: "node_modules/.bin/tsx",
      args: "bot/main.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production" },
    },
  ],
};
