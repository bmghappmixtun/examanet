import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const total = await p.resource.count();
const pub = await p.resource.count({ where: { status: 'PUBLISHED' } });
console.log('Total:', total, 'Published:', pub);
await p.$disconnect();
