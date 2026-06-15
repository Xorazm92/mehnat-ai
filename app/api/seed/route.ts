import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const user = await prisma.user.upsert({
      where: { email: 'admin@mehnat.uz' },
      update: { passwordHash, role: 'super_admin', isActive: true },
      create: {
        email: 'admin@mehnat.uz',
        fullName: 'Super Admin',
        passwordHash,
        role: 'super_admin',
        isActive: true,
        avatarColor: '#6366F1'
      }
    });
    return NextResponse.json({ message: 'User created', email: user.email });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
