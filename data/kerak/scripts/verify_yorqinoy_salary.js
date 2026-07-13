
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { calculateCompanySalaries } from '../lib/kpiLogic.js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceKey);

const YORQINOY_ID = 'a67f17ee-42a2-40d0-8a08-3f98fa5692ac';

async function verify() {
    console.log('--- Verifying Yorqinoy Global Commission (7%) ---');

    const { data: companies, error } = await supabase.from('companies').select('*').eq('is_active', true);
    if (error) { console.error(error); return; }

    console.log(`Found ${companies.length} active companies.`);

    let totalBase = 0;

    companies.forEach(c => {
        // Mock company object to match frontend expectation (camelCase)
        const comp = {
            id: c.id,
            contractAmount: c.contract_amount || 0,
            chiefAccountantPerc: c.chief_accountant_perc || 7,
            chiefAccountantSum: c.chief_accountant_sum || 0
        };

        const results = calculateCompanySalaries(comp);
        const yorqinoyResult = results.find(r => r.staffId === YORQINOY_ID);

        if (yorqinoyResult) {
            totalBase += yorqinoyResult.baseAmount;
        }
    });

    console.log(`Expected Base Salary for Yorqinoy: ${totalBase.toLocaleString()} UZS`);
    console.log('Commission percentage used: 7% (default)');
    console.log('--- Verification Done ---');
}

verify();
