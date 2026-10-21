import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { registerSchema } from '@sales/shared';
import { provisionOwner } from './provision';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
  const input = registerSchema.parse({
    email: process.env.SEED_EMAIL, password: process.env.SEED_PASSWORD,
    name: 'Владелец', workspaceName: 'Мой бизнес',
  });
  // Idempotent: preserve any existing user, password, memberships and business settings.
  if (await db.user.findUnique({ where: { email: input.email } })) {
    console.log('Seed identity already exists; nothing changed.');
    return;
  }
  const passwordHash = await hash(input.password, 12);
  await db.$transaction(tx => provisionOwner(tx, { ...input, passwordHash }));
  console.log('Seed owner created.');
}
main().catch(() => { console.error('Seed failed. Set SEED_EMAIL and SEED_PASSWORD (12–72 bytes); check database connectivity.'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
