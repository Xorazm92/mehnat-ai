import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);
  
  const user = await prisma.profile.upsert({
    where: { email: 'admin@mehnat.uz' },
    update: {
      passwordHash,
      role: 'super_admin'
    },
    create: {
      email: 'admin@mehnat.uz',
      fullName: 'Super Admin',
      passwordHash,
      role: 'super_admin'
    }
  });
  console.log('Admin user created/updated:', user.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
