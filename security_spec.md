# Security Specification — StockLedger Firestore Rules

## 1. Data Invariants
1. Every document is scoped to a verified authenticated user (`request.auth != null && request.auth.token.email_verified == true`).
2. A Company cannot exist without a valid `ownerUid == request.auth.uid` and `request.auth.uid in memberUids` (`memberUids.size() <= 10`).
3. Every sub-collection document under `/companies/{companyId}` (`branches`, `staff`, `products`, `sales`, `heldCarts`, `expenses`, `transfers`, `returns`, `stockTakes`, `reconciliations`) MUST match its parent company's `companyId`, `ownerUid`, and pass `exists()`/`get()` Master Gate verification on single-doc operations.
4. All document IDs (`companyId`, `branchId`, `staffId`, `productId`, etc.) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` characters.
5. All `createdAt` and `updatedAt` fields must equal `request.time`, and `createdAt`, `id`, `companyId`, `ownerUid` are immutable after creation.
6. Updates are partitioned into explicit action-based branches using `affectedKeys().hasOnly(...)` and always validate the full incoming document via `isValid[Entity](incoming())`.
7. Terminal state locking: `Sale` documents in `refunded` state and `StockTransfer` documents in `cancelled` state cannot be mutated further; `StockReturn`, `StockTake`, `Reconciliation`, and `Expense` ledger records are immutable after creation.
8. List queries strictly evaluate `resource.data.ownerUid == request.auth.uid || (resource.data.memberUids is list && request.auth.uid in resource.data.memberUids)` with zero `get()`/`exists()` calls inside `allow list`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Spoof**: Signed-in user with `email_verified: false` attempts to create a company -> `PERMISSION_DENIED`.
2. **Owner Hijack**: User A attempts to create a company with `ownerUid: "user-B"` -> `PERMISSION_DENIED`.
3. **Ghost Field Shadow Write**: Member sends `isSuperAdmin: true` on `products` create/update -> `PERMISSION_DENIED` (`hasOnly()` blocks shadow fields).
4. **ID Poisoning**: Attacker writes document to `/companies/comp1/products/${'a'.repeat(500)}` -> `PERMISSION_DENIED` (`isValidId` rejects > 128 chars).
5. **Cross-Tenant Subcollection Orphan**: User A attempts to create a product under `/companies/compB/products/prod1` -> `PERMISSION_DENIED` (Master Gate `get()` on `companies/compB` rejects).
6. **Timestamp Spoofing**: Client sends `createdAt: new Date('2020-01-01')` instead of `serverTimestamp()` -> `PERMISSION_DENIED` (`createdAt == request.time`).
7. **Immutable Field Mutation**: Member attempts to update `ownerUid` or `createdAt` on an existing `Sale` -> `PERMISSION_DENIED`.
8. **Terminal Sale Overwrite**: Member attempts to update a `Sale` whose existing `status == 'refunded'` -> `PERMISSION_DENIED`.
9. **Unbounded Array Bomb**: Client sends `items` array with 500 elements on a `Sale` -> `PERMISSION_DENIED` (`items.size() <= 200`).
10. **Non-Map Array Element Injection**: Client sends `items: ["bad-string"]` -> `PERMISSION_DENIED` (`items[0] is map`).
11. **Member List Bloat**: Client sends `memberUids` with 25 UIDs -> `PERMISSION_DENIED` (`memberUids.size() <= 10`).
12. **Cross-Tenant List Scraping**: User A runs `getDocs(collection(db, 'companies/compB/sales'))` -> `PERMISSION_DENIED` (`allow list` evaluates `resource.data`).
