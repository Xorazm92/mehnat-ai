
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Sends a notification to a specific chat ID
 */
async function sendTelegramMessage(chatId, message) {
    if (!BOT_TOKEN) {
        console.warn('TELEGRAM_BOT_TOKEN not found in .env.local');
        return;
    }
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('Error sending Telegram message:', error.response?.data || error.message);
    }
}

/**
 * Monitors changes in operations/KPI and notifies staff
 */
async function monitorSalaryChanges() {
    console.log('Monitoring salary changes...');

    // Example: Listen to 'operations' table updates using Supabase Realtime
    // For a script, we can periodically poll or use a webhook

    // Let's implement a simple polling for demo purposes
    const { data: operations, error } = await supabase
        .from('operations')
        .select('*, companies(name, accountant_id, profiles(full_name, phone))')
        .order('updated_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching operations:', error);
        return;
    }

    for (const op of operations) {
        // Logic: If KPI changed significantly, send alert
        // (This is a simplified example)
        const staffName = op.companies.profiles.full_name;
        const companyName = op.companies.name;

        const message = `🔔 *KPI Yangilanishi*\n\n` +
            `👤 Xodim: ${staffName}\n` +
            `🏢 Firma: ${companyName}\n` +
            `📊 Holat yangilandi: ${op.profit_tax_status}\n\n` +
            `Tizimga kirib batafsil ko'rishingiz mumkin.`;

        // Note: We need the staff's Telegram Chat ID, which should be stored in 'profiles'
        // For now, we logging.
        console.log(`Notification for ${staffName}: ${message}`);
    }
}

// In a real production environment, you would use Supabase Functions 
// or a long-running Node.js process with Realtime subscriptions.
console.log('Telegram Bot Script Ready. Configure BOT_TOKEN and Staff Chat IDs to enable.');
