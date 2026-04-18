const fs = require('fs');
const path = require('path');

const files = [
  'components/SupervisorDashboard.tsx',
  'components/StaffCabinet.tsx',
  'components/CompanyDrawer.tsx',
  'components/StaffProfileDrawer.tsx',
  'components/PayrollDrafts.tsx',
  'components/KPIRulesManager.tsx',
  'components/OrganizationModule.tsx',
  'components/OperationModule.tsx',
  'components/AuditLogModule.tsx',
  'components/KassaModule.tsx',
  'components/ExpenseModule.tsx',
  'components/CompanyMatrix.tsx',
  'components/Leaderboard.tsx'
];

let updatedCount = 0;

files.forEach(relativePath => {
  const f = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(f)) return;
  
  let content = fs.readFileSync(f, 'utf8');
  let originalContent = content;

  content = content.replace(/liquid-glass-card/g, 'c1-card');
  content = content.replace(/liquid-glass-sidebar/g, 'c1-card');
  content = content.replace(/liquid-glass-[a-z-]+/g, '');
  content = content.replace(/shadow-glass(-[a-z0-9]+)?/g, 'shadow-sm');
  content = content.replace(/rounded-\[[0-9.]+(rem|px)\]/g, 'rounded-sm');
  content = content.replace(/rounded-3xl/g, 'rounded-sm');
  content = content.replace(/rounded-2xl/g, 'rounded-sm');
  content = content.replace(/rounded-xl/g, 'rounded-sm');
  content = content.replace(/rounded-lg/g, 'rounded-sm');
  content = content.replace(/backdrop-blur(-md|-sm|-lg)?/g, '');
  content = content.replace(/animate-macos/g, '');
  content = content.replace(/animate-fade-in(-up)?/g, '');
  
  if (content !== originalContent) {
    fs.writeFileSync(f, content);
    updatedCount++;
    console.log(`Updated ${f}`);
  }
});

console.log(`Updated ${updatedCount} files.`);
