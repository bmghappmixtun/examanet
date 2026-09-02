import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.user.groupBy({
  by: ['role', 'status'],
  _count: { _all: true },
  orderBy: [{ role: 'asc' }, { status: 'asc' }],
});
console.log('Role | Status | Count');
console.log('-----|--------|------');
for (const r of rows) console.log(`${r.role} | ${r.status} | ${r._count._all}`);
await p.$disconnect();
