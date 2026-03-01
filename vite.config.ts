import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';

const adminProxyPlugin = (env: Record<string, string>) => ({
  name: 'supabase-admin-proxy',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url === '/api/admin/create-user' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body);
            const supabaseUrl = env.VITE_SUPABASE_URL;
            const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

            if (!supabaseUrl || !serviceKey) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: "Missing Service Role Key in .env.local" }));
            }

            const supabase = createClient(supabaseUrl, serviceKey);

            if (req.url === '/api/admin/create-user') {
              const { data, error } = await supabase.auth.admin.createUser({
                email: parsed.email,
                password: parsed.password,
                email_confirm: true,
                user_metadata: parsed.data
              });

              res.setHeader('Content-Type', 'application/json');
              if (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: error.message }));
              } else {
                res.end(JSON.stringify(data));
              }
            } else if (req.url === '/api/admin/upsert-staff') {
              // Bypasses FK profiles_id_fkey, RLS, and handles Enum casting naturally
              const { data, error } = await supabase.from('profiles').upsert(parsed);

              res.setHeader('Content-Type', 'application/json');
              if (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: error.message }));
              } else {
                res.end(JSON.stringify(data));
              }
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else {
        next();
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), adminProxyPlugin(env)],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
