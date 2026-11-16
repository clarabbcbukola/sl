// Adversarial security test suite specification for StockLedger Firestore rules.
// Run against Firebase Emulator Suite (@firebase/rules-unit-testing) when testing locally.

export const DIRTY_DOZEN_PAYLOADS = [
  { name: 'Unverified Email Spoof', target: 'companies/comp_1', auth: { uid: 'u1', email_verified: false } },
  { name: 'Owner Hijack', target: 'companies/comp_1', payload: { ownerUid: 'u2' }, auth: { uid: 'u1', email_verified: true } },
  { name: 'Ghost Field Shadow Write', target: 'companies/comp_1/products/p1', payload: { isSuperAdmin: true } },
  { name: 'ID Poisoning', target: `companies/comp_1/products/${'a'.repeat(500)}`, payload: {} },
  { name: 'Cross-Tenant Subcollection Orphan', target: 'companies/comp_other/products/p1', auth: { uid: 'u1', email_verified: true } },
  { name: 'Timestamp Spoofing', target: 'companies/comp_1', payload: { createdAt: '2020-01-01T00:00:00Z' } },
  { name: 'Immutable Field Mutation', target: 'companies/comp_1/sales/s1', method: 'update', payload: { ownerUid: 'u2' } },
  { name: 'Terminal Sale Overwrite', target: 'companies/comp_1/sales/s_refunded', method: 'update', payload: { status: 'completed' } },
  { name: 'Unbounded Array Bomb', target: 'companies/comp_1/sales/s2', payload: { items: Array(201).fill({}) } },
  { name: 'Non-Map Array Element Injection', target: 'companies/comp_1/sales/s2', payload: { items: ['invalid'] } },
  { name: 'Member List Bloat', target: 'companies/comp_1', payload: { memberUids: Array(11).fill('uid') } },
  { name: 'Cross-Tenant List Scraping', target: 'companies/comp_other/sales', method: 'list', auth: { uid: 'u1', email_verified: true } }
];
