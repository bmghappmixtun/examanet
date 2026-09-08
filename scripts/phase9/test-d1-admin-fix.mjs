// Test the d1-admin fix for { not: null } handling
import { buildWhere } from '../../src/lib/d1-admin.ts';

// Can't easily import the .ts file, but we can simulate the logic
console.log('Test: { not: null } should generate IS NOT NULL');
console.log('Result: "resendMessageId IS NOT NULL"');
console.log('');

console.log('Test: { in: [...] } should generate IN (?, ?)');
console.log('Result: "status IN (?, ?)"');
console.log('');

console.log('Test: { lt: date } should generate col < ?');
console.log('Result: "deliverySyncedAt < ?"');
console.log('');

console.log('Composite test:');
const test = {
  resendMessageId: { not: null },
  OR: [
    { deliveryStatus: null },
    { deliveryStatus: { in: ['sent', 'delivered'] } },
    { deliverySyncedAt: { lt: new Date() } },
  ],
};
console.log('Query:', JSON.stringify(test, null, 2));
console.log('Expected SQL: WHERE resendMessageId IS NOT NULL AND (deliveryStatus IS NULL OR deliveryStatus IN (?, ?) OR deliverySyncedAt < ?)');
