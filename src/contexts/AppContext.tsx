import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  waitForPendingWrites,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  Branch,
  CartItem,
  Company,
  Expense,
  ExpenseLineItem,
  ExpenseType,
  HeldCart,
  PaymentMethod,
  Product,
  Reconciliation,
  RefundMethod,
  Sale,
  SaleLineItem,
  SaleMode,
  StaffRole,
  StaffUser,
  StockReturn,
  StockTake,
  StockTakeAction,
  StockTransfer,
} from '../types';
import { calculateCartTotals, roundMoney } from '../utils/accounting';
import { ParsedCSVProductRow, fetchPreloadedStockCSV } from '../utils/csv';
import {
  clampStr,
  generateId,
  generateTrackingNumber,
  getTodayDateKey,
  hashPin,
} from '../utils/format';

interface AppContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  isLoadingData: boolean;
  isOnline: boolean;
  hasPendingSync: boolean;
  seedProgress: { current: number; total: number; label: string } | null;
  company: Company | null;
  branches: Branch[];
  staffUsers: StaffUser[];
  products: Product[];
  sales: Sale[];
  heldCarts: HeldCart[];
  expenses: Expense[];
  transfers: StockTransfer[];
  returns: StockReturn[];
  stockTakes: StockTake[];
  reconciliations: Reconciliation[];
  activeBranchId: string;
  setActiveBranchId: (branchId: string) => void;
  activeBranch: Branch | null;
  activeStaff: StaffUser | null;
  // Cart state
  cart: CartItem[];
  saleMode: SaleMode;
  setSaleMode: (mode: SaleMode) => void;
  cartDiscountPct: number;
  setCartDiscountPct: (pct: number) => void;
  activeHeldCartId: string | null;
  addToCart: (product: Product, qty?: number) => void;
  updateCartQty: (productId: string, qty: number) => void;
  updateCartCustomPrice: (productId: string, price: number | undefined) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  // Auth & Session
  signInWithGoogle: () => Promise<void>;
  logoutGoogle: () => Promise<void>;
  unlockWithPin: (staffId: string, pin: string) => Promise<boolean>;
  lockTerminal: () => void;
  createCompanyWithPreload: (input: {
    companyName: string;
    currency: string;
    taxRate: number;
    taxInclusive: boolean;
    wholesaleDiscountPct: number;
    address: string;
    phone: string;
    ownerName: string;
    ownerPin: string;
    preloadCatalog: boolean;
  }) => Promise<void>;
  // POS Actions
  checkoutCart: (params: {
    paymentMethod: PaymentMethod;
    amountTendered: number;
    customerName: string;
    customerPhone: string;
    notes: string;
  }) => Promise<Sale>;
  holdCurrentCart: (reference: string) => Promise<void>;
  resumeHeldCart: (heldCartId: string) => Promise<void>;
  deleteHeldCart: (heldCartId: string) => Promise<void>;
  // Inventory Actions
  saveProduct: (
    data: Omit<Product, 'id' | 'companyId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  importCSVProducts: (
    rows: ParsedCSVProductRow[],
    targetBranchId: string,
    mode: 'merge' | 'add_only'
  ) => Promise<{ created: number; updated: number }>;
  reloadPreloadedCSV: (targetBranchId: string) => Promise<{ created: number; updated: number }>;
  transferStock: (params: {
    fromBranchId: string;
    toBranchId: string;
    items: { product: Product; qty: number }[];
    notes: string;
  }) => Promise<StockTransfer>;
  commitStockTake: (params: {
    branchId: string;
    actionType: StockTakeAction;
    adjustments: { product: Product; newQty: number }[];
    notes: string;
  }) => Promise<StockTake>;
  // Returns
  processStockReturn: (params: {
    sale: Sale;
    items: { saleItem: SaleLineItem; returnQty: number }[];
    refundMethod: RefundMethod;
    restockItems: boolean;
    reason: string;
  }) => Promise<StockReturn>;
  // Expenses & Accounting
  recordExpense: (params: {
    branchId: string;
    expenseType: ExpenseType;
    category: string;
    vendor: string;
    description: string;
    paymentMethod: 'cash' | 'card' | 'transfer' | 'credit';
    amount: number;
    taxAmount: number;
    purchaseItems?: { product: Product; qty: number; unitCost: number }[];
  }) => Promise<Expense>;
  commitReconciliation: (params: {
    branchId: string;
    dateKey: string;
    expectedCash: number;
    actualCash: number;
    expectedCard: number;
    actualCard: number;
    expectedTransfer: number;
    actualTransfer: number;
    cashRefunds: number;
    cashExpenses: number;
    notes: string;
  }) => Promise<Reconciliation>;
  // Settings
  updateCompanySettings: (
    patch: Partial<
      Pick<
        Company,
        | 'name'
        | 'currency'
        | 'taxRate'
        | 'taxInclusive'
        | 'wholesaleDiscountPct'
        | 'address'
        | 'phone'
        | 'email'
        | 'receiptFooter'
        | 'allowNegativeStock'
      >
    >
  ) => Promise<void>;
  createBranch: (data: { name: string; code: string; address: string; phone: string }) => Promise<Branch>;
  updateBranch: (branchId: string, patch: Partial<Pick<Branch, 'name' | 'code' | 'address' | 'phone' | 'active'>>) => Promise<void>;
  createStaffUser: (data: { name: string; role: StaffRole; branchId: string; pin: string }) => Promise<StaffUser>;
  updateStaffUser: (
    staffId: string,
    patch: { name?: string; role?: StaffRole; branchId?: string; active?: boolean; newPin?: string }
  ) => Promise<void>;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [seedProgress, setSeedProgress] = useState<{ current: number; total: number; label: string } | null>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [returns, setReturns] = useState<StockReturn[]>([]);
  const [stockTakes, setStockTakes] = useState<StockTake[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);

  const [activeBranchId, setActiveBranchId] = useState<string>('');
  const [activeStaff, setActiveStaff] = useState<StaffUser | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleMode, setSaleMode] = useState<SaleMode>('retail');
  const [cartDiscountPct, setCartDiscountPct] = useState<number>(0);
  const [activeHeldCartId, setActiveHeldCartId] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('stockledger_dark');
    return saved === 'true';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('stockledger_dark', String(darkMode));
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const hasPendingSync = useMemo(
    () => Object.values(pendingMap).some(Boolean),
    [pendingMap]
  );

  const commitOfflineSafe = useCallback(
    async (writePromise: Promise<void>, opType: OperationType, path: string): Promise<void> => {
      const guarded = writePromise.catch((err) => {
        handleFirestoreError(err, opType, path);
      });
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      await Promise.race([
        guarded,
        new Promise<void>((resolve) => setTimeout(resolve, 2500)),
      ]);
    },
    []
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      waitForPendingWrites(db).catch(() => {
        // Pending writes continue retrying automatically via Firestore cache
      });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setCompany(null);
        setBranches([]);
        setStaffUsers([]);
        setProducts([]);
        setSales([]);
        setHeldCarts([]);
        setExpenses([]);
        setTransfers([]);
        setReturns([]);
        setStockTakes([]);
        setReconciliations([]);
        setActiveStaff(null);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to user's company
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) {
      setCompany(null);
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    const q = query(
      collection(db, 'companies'),
      where('memberUids', 'array-contains', firebaseUser.uid)
    );

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setPendingMap((prev) => ({ ...prev, companies: snap.metadata.hasPendingWrites }));
        if (snap.empty) {
          setCompany(null);
          setIsLoadingData(false);
          return;
        }
        const docSnap = snap.docs[0];
        const comp = { id: docSnap.id, ...docSnap.data() } as Company;
        setCompany(comp);
        setIsLoadingData(false);
      },
      (err) => {
        setIsLoadingData(false);
        handleFirestoreError(err, OperationType.LIST, 'companies');
      }
    );

    return () => unsub();
  }, [authReady, firebaseUser]);

  // Subscribe to all company subcollections in real time
  useEffect(() => {
    if (!company || !firebaseUser) return;
    const cid = company.id;
    const uid = firebaseUser.uid;

    const subscribeCol = <T,>(
      subPath: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortFn?: (a: T, b: T) => number
    ) => {
      const fullPath = `companies/${cid}/${subPath}`;
      const q = query(
        collection(db, 'companies', cid, subPath),
        where('memberUids', 'array-contains', uid)
      );
      return onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          setPendingMap((prev) => ({ ...prev, [subPath]: snap.metadata.hasPendingWrites }));
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
          if (sortFn) list.sort(sortFn);
          setter(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, fullPath);
        }
      );
    };

    const getTimeMs = (item: { id?: string; createdAt?: unknown }) => {
      const ts = item.createdAt as { toMillis?: () => number } | undefined;
      if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
      if (item.id) {
        const parts = item.id.split('_');
        if (parts.length >= 2) {
          const parsed = Number.parseInt(parts[1], 36);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      }
      return Date.now();
    };

    const unsubs = [
      subscribeCol<Branch>('branches', setBranches, (a, b) => (a.isMain === b.isMain ? a.name.localeCompare(b.name) : a.isMain ? -1 : 1)),
      subscribeCol<StaffUser>('staff', setStaffUsers, (a, b) => a.name.localeCompare(b.name)),
      subscribeCol<Product>('products', setProducts, (a, b) => a.name.localeCompare(b.name)),
      subscribeCol<Sale>('sales', setSales, (a, b) => getTimeMs(b) - getTimeMs(a)),
      subscribeCol<HeldCart>('heldCarts', setHeldCarts, (a, b) => getTimeMs(b) - getTimeMs(a)),
      subscribeCol<Expense>('expenses', setExpenses, (a, b) => getTimeMs(b) - getTimeMs(a)),
      subscribeCol<StockTransfer>('transfers', setTransfers, (a, b) => getTimeMs(b) - getTimeMs(a)),
      subscribeCol<StockReturn>('returns', setReturns, (a, b) => getTimeMs(b) - getTimeMs(a)),
      subscribeCol<StockTake>('stockTakes', setStockTakes, (a, b) => getTimeMs(b) - getTimeMs(a)),
      subscribeCol<Reconciliation>('reconciliations', setReconciliations, (a, b) => getTimeMs(b) - getTimeMs(a)),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [company?.id, firebaseUser?.uid]);

  // Keep activeBranchId valid
  useEffect(() => {
    if (branches.length === 0) return;
    if (!activeBranchId || !branches.some((b) => b.id === activeBranchId && b.active)) {
      const main = branches.find((b) => b.isMain && b.active) || branches.find((b) => b.active) || branches[0];
      if (main) setActiveBranchId(main.id);
    }
  }, [branches, activeBranchId]);

  // Restore staff session for current tab if valid
  useEffect(() => {
    if (!company || staffUsers.length === 0 || activeStaff) return;
    const savedStaffId = sessionStorage.getItem(`stockledger_staff_${company.id}`);
    if (savedStaffId) {
      const found = staffUsers.find((s) => s.id === savedStaffId && s.active);
      if (found) {
        setActiveStaff(found);
      }
    }
  }, [company, staffUsers, activeStaff]);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) || branches[0] || null,
    [branches, activeBranchId]
  );

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const logoutGoogle = useCallback(async () => {
    if (company) {
      sessionStorage.removeItem(`stockledger_staff_${company.id}`);
    }
    setActiveStaff(null);
    await signOut(auth);
  }, [company]);

  const unlockWithPin = useCallback(
    async (staffId: string, pin: string): Promise<boolean> => {
      const staff = staffUsers.find((s) => s.id === staffId && s.active);
      if (!staff) return false;
      const hashed = await hashPin(pin);
      if (hashed !== staff.pinHash) return false;
      setActiveStaff(staff);
      if (company) {
        sessionStorage.setItem(`stockledger_staff_${company.id}`, staff.id);
      }
      if (staff.branchId !== 'all' && branches.some((b) => b.id === staff.branchId && b.active)) {
        setActiveBranchId(staff.branchId);
      }
      return true;
    },
    [staffUsers, company, branches]
  );

  const lockTerminal = useCallback(() => {
    if (company) {
      sessionStorage.removeItem(`stockledger_staff_${company.id}`);
    }
    setActiveStaff(null);
  }, [company]);

  const writeProductBatches = useCallback(
    async (
      comp: Pick<Company, 'id' | 'ownerUid' | 'memberUids'>,
      branch: Pick<Branch, 'id' | 'name'>,
      rows: ParsedCSVProductRow[],
      startSkuNum: number
    ) => {
      const CHUNK = 400;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach((item, idx) => {
          const prodId = generateId('prd');
          const skuNum = String(startSkuNum + i + idx).padStart(4, '0');
          const sku = clampStr(item.sku || `SKU-${skuNum}`, 64);
          const ref = doc(db, 'companies', comp.id, 'products', prodId);
          batch.set(ref, {
            id: prodId,
            companyId: comp.id,
            ownerUid: comp.ownerUid,
            memberUids: comp.memberUids,
            sku,
            name: clampStr(item.name, 200),
            category: clampStr(item.category || 'General Pharmacy', 80),
            price: Math.max(0, Number(item.price) || 0),
            wholesalePrice: Math.max(0, Number(item.wholesalePrice) || 0),
            cost: Math.max(0, Number(item.cost) || 0),
            qty: Number(item.qty) || 0,
            minStock: Math.max(0, Number(item.minStock) || 0),
            branchId: branch.id,
            branchName: clampStr(branch.name, 80),
            unit: clampStr(item.unit || 'pcs', 30) || 'pcs',
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await commitOfflineSafe(
          batch.commit(),
          OperationType.WRITE,
          `companies/${comp.id}/products`
        );
        setSeedProgress({
          current: Math.min(i + slice.length, rows.length),
          total: rows.length,
          label: 'Syncing preloaded stock catalog to Firebase...',
        });
      }
    },
    [commitOfflineSafe]
  );

  const createCompanyWithPreload = useCallback(
    async (input: {
      companyName: string;
      currency: string;
      taxRate: number;
      taxInclusive: boolean;
      wholesaleDiscountPct: number;
      address: string;
      phone: string;
      ownerName: string;
      ownerPin: string;
      preloadCatalog: boolean;
    }) => {
      if (!firebaseUser) throw new Error('Must be signed in with Google first');
      const companyId = generateId('comp');
      const uid = firebaseUser.uid;
      const memberUids = [uid];

      const companyPayload = {
        id: companyId,
        name: clampStr(input.companyName, 120) || 'My Store',
        currency: clampStr(input.currency, 10) || '₦',
        taxRate: Math.max(0, Math.min(100, Number(input.taxRate) || 0)),
        taxInclusive: Boolean(input.taxInclusive),
        wholesaleDiscountPct: Math.max(0, Math.min(95, Number(input.wholesaleDiscountPct) || 0)),
        address: clampStr(input.address, 250),
        phone: clampStr(input.phone, 40),
        email: clampStr(firebaseUser.email || '', 120),
        receiptFooter: 'Thank you for your patronage. Goods sold in good condition.',
        allowNegativeStock: false,
        ownerUid: uid,
        memberUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        await setDoc(doc(db, 'companies', companyId), companyPayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `companies/${companyId}`);
      }

      const mainBranchId = 'branch_main';
      const ownerStaffId = generateId('stf');
      const pinHash = await hashPin(input.ownerPin);

      const setupBatch = writeBatch(db);
      const mainBranch: Omit<Branch, 'createdAt' | 'updatedAt'> = {
        id: mainBranchId,
        companyId,
        ownerUid: uid,
        memberUids,
        name: 'Main',
        code: 'MAIN',
        address: clampStr(input.address, 250),
        phone: clampStr(input.phone, 40),
        isMain: true,
        active: true,
      };
      setupBatch.set(doc(db, 'companies', companyId, 'branches', mainBranchId), {
        ...mainBranch,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const ownerStaff: Omit<StaffUser, 'createdAt' | 'updatedAt'> = {
        id: ownerStaffId,
        companyId,
        ownerUid: uid,
        memberUids,
        name: clampStr(input.ownerName, 80) || 'Store Owner',
        role: 'owner',
        branchId: 'all',
        pinHash,
        active: true,
      };
      setupBatch.set(doc(db, 'companies', companyId, 'staff', ownerStaffId), {
        ...ownerStaff,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        await setupBatch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `companies/${companyId}/branches`);
      }

      if (input.preloadCatalog) {
        setSeedProgress({ current: 0, total: 1, label: 'Reading preloaded stock inventory CSV...' });
        try {
          const rows = await fetchPreloadedStockCSV(input.wholesaleDiscountPct);
          setSeedProgress({ current: 0, total: rows.length, label: 'Uploading stock items to Firebase...' });
          await writeProductBatches(
            { id: companyId, ownerUid: uid, memberUids },
            { id: mainBranchId, name: 'Main' },
            rows,
            1
          );
        } finally {
          setSeedProgress(null);
        }
      }

      setActiveBranchId(mainBranchId);
      setActiveStaff(ownerStaff);
      sessionStorage.setItem(`stockledger_staff_${companyId}`, ownerStaff.id);
    },
    [firebaseUser, writeProductBatches]
  );

  // Cart Operations
  const addToCart = useCallback(
    (product: Product, qtyToAdd = 1) => {
      setCart((prev) => {
        const existing = prev.find((c) => c.productId === product.id);
        if (existing) {
          const nextQty = existing.qty + qtyToAdd;
          if (!company?.allowNegativeStock && product.qty > 0 && nextQty > product.qty) {
            return prev.map((c) =>
              c.productId === product.id ? { ...c, qty: product.qty } : c
            );
          }
          return prev.map((c) =>
            c.productId === product.id ? { ...c, qty: nextQty } : c
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            qty: qtyToAdd,
            retailPrice: product.price,
            wholesalePrice: product.wholesalePrice,
            unitCost: product.cost,
            inStockAtAdd: product.qty,
          },
        ];
      });
    },
    [company?.allowNegativeStock]
  );

  const updateCartQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, qty } : c)));
  }, []);

  const updateCartCustomPrice = useCallback((productId: string, price: number | undefined) => {
    setCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, customUnitPrice: price } : c))
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCartDiscountPct(0);
    setActiveHeldCartId(null);
  }, []);

  const checkoutCart = useCallback(
    async (params: {
      paymentMethod: PaymentMethod;
      amountTendered: number;
      customerName: string;
      customerPhone: string;
      notes: string;
    }): Promise<Sale> => {
      if (!company || !activeBranch || !activeStaff) {
        throw new Error('Active company, branch, and staff session required');
      }
      if (cart.length === 0) throw new Error('Cart is empty');

      const lineItems: SaleLineItem[] = cart.map((item) => {
        const unitPrice =
          item.customUnitPrice !== undefined
            ? item.customUnitPrice
            : saleMode === 'wholesale'
            ? item.wholesalePrice
            : item.retailPrice;
        return {
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          returnedQty: 0,
          unitPrice,
          unitCost: item.unitCost,
          lineTotal: roundMoney(item.qty * unitPrice),
        };
      });

      const totals = calculateCartTotals(lineItems, cartDiscountPct, company);
      const saleId = generateId('sale');
      const trackingNumber = generateTrackingNumber('TRX');
      const dateKey = getTodayDateKey();
      const amountTendered = Math.max(0, Number(params.amountTendered) || totals.total);
      const changeDue =
        params.paymentMethod === 'cash'
          ? roundMoney(Math.max(0, amountTendered - totals.total))
          : 0;

      const saleDoc: Sale = {
        id: saleId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        trackingNumber,
        branchId: activeBranch.id,
        branchName: activeBranch.name,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        saleMode,
        customerName: clampStr(params.customerName, 120),
        customerPhone: clampStr(params.customerPhone, 40),
        paymentMethod: params.paymentMethod,
        items: lineItems,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        totalCost: totals.totalCost,
        amountTendered,
        changeDue,
        returnedAmount: 0,
        status: 'completed',
        notes: clampStr(params.notes, 300),
        dateKey,
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'companies', company.id, 'sales', saleId), {
        ...saleDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const line of lineItems) {
        const prod = products.find((p) => p.id === line.productId);
        if (prod) {
          const nextQty = roundMoney(prod.qty - line.qty);
          batch.update(doc(db, 'companies', company.id, 'products', prod.id), {
            qty: nextQty,
            updatedAt: serverTimestamp(),
          });
        }
      }

      if (activeHeldCartId) {
        batch.delete(doc(db, 'companies', company.id, 'heldCarts', activeHeldCartId));
      }

      await commitOfflineSafe(
        batch.commit(),
        OperationType.WRITE,
        `companies/${company.id}/sales/${saleId}`
      );

      clearCart();
      return saleDoc;
    },
    [company, activeBranch, activeStaff, cart, saleMode, cartDiscountPct, products, activeHeldCartId, clearCart, commitOfflineSafe]
  );

  const holdCurrentCart = useCallback(
    async (reference: string) => {
      if (!company || !activeBranch || !activeStaff || cart.length === 0) return;
      const cartId = generateId('hold');
      const items = cart.map((c) => ({
        productId: c.productId,
        sku: c.sku,
        name: c.name,
        qty: c.qty,
        retailPrice: c.retailPrice,
        wholesalePrice: c.wholesalePrice,
        unitCost: c.unitCost,
      }));
      const totals = calculateCartTotals(
        cart.map((c) => ({
          qty: c.qty,
          unitPrice: saleMode === 'wholesale' ? c.wholesalePrice : c.retailPrice,
          unitCost: c.unitCost,
        })),
        cartDiscountPct,
        company
      );

      await commitOfflineSafe(
        setDoc(doc(db, 'companies', company.id, 'heldCarts', cartId), {
          id: cartId,
          companyId: company.id,
          ownerUid: company.ownerUid,
          memberUids: company.memberUids,
          reference: clampStr(reference, 120) || `Hold ${new Date().toLocaleTimeString()}`,
          branchId: activeBranch.id,
          branchName: activeBranch.name,
          staffId: activeStaff.id,
          staffName: activeStaff.name,
          saleMode,
          items,
          discountPct: cartDiscountPct,
          total: totals.total,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        `companies/${company.id}/heldCarts/${cartId}`
      );

      clearCart();
    },
    [company, activeBranch, activeStaff, cart, saleMode, cartDiscountPct, clearCart, commitOfflineSafe]
  );

  const resumeHeldCart = useCallback(
    async (heldCartId: string) => {
      if (!company) return;
      const found = heldCarts.find((h) => h.id === heldCartId);
      if (!found) return;

      setSaleMode(found.saleMode);
      setCartDiscountPct(found.discountPct);
      setActiveHeldCartId(found.id);
      if (branches.some((b) => b.id === found.branchId && b.active)) {
        setActiveBranchId(found.branchId);
      }

      const restored: CartItem[] = found.items.map((item) => {
        const liveProd = products.find((p) => p.id === item.productId);
        return {
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          retailPrice: liveProd ? liveProd.price : item.retailPrice,
          wholesalePrice: liveProd ? liveProd.wholesalePrice : item.wholesalePrice,
          unitCost: liveProd ? liveProd.cost : item.unitCost,
          inStockAtAdd: liveProd ? liveProd.qty : 0,
        };
      });
      setCart(restored);

      await commitOfflineSafe(
        deleteDoc(doc(db, 'companies', company.id, 'heldCarts', heldCartId)),
        OperationType.DELETE,
        `companies/${company.id}/heldCarts/${heldCartId}`
      );
      setActiveHeldCartId(null);
    },
    [company, heldCarts, branches, products, commitOfflineSafe]
  );

  const deleteHeldCart = useCallback(
    async (heldCartId: string) => {
      if (!company) return;
      await commitOfflineSafe(
        deleteDoc(doc(db, 'companies', company.id, 'heldCarts', heldCartId)),
        OperationType.DELETE,
        `companies/${company.id}/heldCarts/${heldCartId}`
      );
    },
    [company, commitOfflineSafe]
  );

  const saveProduct = useCallback(
    async (
      data: Omit<Product, 'id' | 'companyId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ) => {
      if (!company) return;
      if (existingId) {
        await commitOfflineSafe(
          updateDoc(doc(db, 'companies', company.id, 'products', existingId), {
            sku: clampStr(data.sku, 64),
            name: clampStr(data.name, 200),
            category: clampStr(data.category, 80),
            price: Math.max(0, Number(data.price) || 0),
            wholesalePrice: Math.max(0, Number(data.wholesalePrice) || 0),
            cost: Math.max(0, Number(data.cost) || 0),
            qty: Number(data.qty) || 0,
            minStock: Math.max(0, Number(data.minStock) || 0),
            unit: clampStr(data.unit || 'pcs', 30) || 'pcs',
            active: data.active,
            updatedAt: serverTimestamp(),
          }),
          OperationType.UPDATE,
          `companies/${company.id}/products/${existingId}`
        );
      } else {
        const prodId = generateId('prd');
        await commitOfflineSafe(
          setDoc(doc(db, 'companies', company.id, 'products', prodId), {
            id: prodId,
            companyId: company.id,
            ownerUid: company.ownerUid,
            memberUids: company.memberUids,
            sku: clampStr(data.sku, 64) || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
            name: clampStr(data.name, 200),
            category: clampStr(data.category, 80) || 'General Pharmacy',
            price: Math.max(0, Number(data.price) || 0),
            wholesalePrice: Math.max(0, Number(data.wholesalePrice) || 0),
            cost: Math.max(0, Number(data.cost) || 0),
            qty: Number(data.qty) || 0,
            minStock: Math.max(0, Number(data.minStock) || 0),
            branchId: data.branchId,
            branchName: clampStr(data.branchName, 80),
            unit: clampStr(data.unit || 'pcs', 30) || 'pcs',
            active: data.active,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          `companies/${company.id}/products/${prodId}`
        );
      }
    },
    [company, commitOfflineSafe]
  );

  const deleteProduct = useCallback(
    async (productId: string) => {
      if (!company) return;
      await commitOfflineSafe(
        deleteDoc(doc(db, 'companies', company.id, 'products', productId)),
        OperationType.DELETE,
        `companies/${company.id}/products/${productId}`
      );
    },
    [company, commitOfflineSafe]
  );

  const importCSVProducts = useCallback(
    async (
      rows: ParsedCSVProductRow[],
      targetBranchId: string,
      mode: 'merge' | 'add_only'
    ): Promise<{ created: number; updated: number }> => {
      if (!company) throw new Error('No active company');
      const targetBranch = branches.find((b) => b.id === targetBranchId);
      if (!targetBranch) throw new Error('Target branch not found');

      const existingInBranch = products.filter((p) => p.branchId === targetBranch.id);
      const toCreate: ParsedCSVProductRow[] = [];
      const toUpdate: { id: string; row: ParsedCSVProductRow }[] = [];

      for (const row of rows) {
        const match = existingInBranch.find(
          (p) =>
            (row.sku && p.sku.toLowerCase() === row.sku.toLowerCase()) ||
            p.name.trim().toLowerCase() === row.name.trim().toLowerCase()
        );
        if (match && mode === 'merge') {
          toUpdate.push({ id: match.id, row });
        } else if (!match) {
          toCreate.push(row);
        }
      }

      const CHUNK = 400;
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const item of toUpdate.slice(i, i + CHUNK)) {
          batch.update(doc(db, 'companies', company.id, 'products', item.id), {
            price: item.row.price,
            wholesalePrice: item.row.wholesalePrice,
            cost: item.row.cost,
            qty: item.row.qty,
            minStock: item.row.minStock,
            category: clampStr(item.row.category, 80),
            updatedAt: serverTimestamp(),
          });
        }
        await commitOfflineSafe(
          batch.commit(),
          OperationType.UPDATE,
          `companies/${company.id}/products`
        );
      }

      if (toCreate.length > 0) {
        setSeedProgress({
          current: 0,
          total: toCreate.length,
          label: `Importing ${toCreate.length} items to ${targetBranch.name}...`,
        });
        try {
          await writeProductBatches(company, targetBranch, toCreate, existingInBranch.length + 1);
        } finally {
          setSeedProgress(null);
        }
      }

      return { created: toCreate.length, updated: toUpdate.length };
    },
    [company, branches, products, writeProductBatches, commitOfflineSafe]
  );

  const reloadPreloadedCSV = useCallback(
    async (targetBranchId: string) => {
      if (!company) throw new Error('No active company');
      const rows = await fetchPreloadedStockCSV(company.wholesaleDiscountPct);
      return importCSVProducts(rows, targetBranchId, 'merge');
    },
    [company, importCSVProducts]
  );

  const transferStock = useCallback(
    async (params: {
      fromBranchId: string;
      toBranchId: string;
      items: { product: Product; qty: number }[];
      notes: string;
    }): Promise<StockTransfer> => {
      if (!company || !activeStaff) throw new Error('Active session required');
      const fromBranch = branches.find((b) => b.id === params.fromBranchId);
      const toBranch = branches.find((b) => b.id === params.toBranchId);
      if (!fromBranch || !toBranch || fromBranch.id === toBranch.id) {
        throw new Error('Select two distinct branches');
      }
      if (params.items.length === 0) throw new Error('Select at least one item to transfer');

      const transferId = generateId('trf');
      const trackingNumber = generateTrackingNumber('TRF');
      const dateKey = getTodayDateKey();

      let totalQty = 0;
      let totalCostValue = 0;
      const transferLines = params.items.map(({ product, qty }) => {
        totalQty += qty;
        totalCostValue += qty * product.cost;
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          qty,
          unitCost: product.cost,
        };
      });

      const transferDoc: StockTransfer = {
        id: transferId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        trackingNumber,
        fromBranchId: fromBranch.id,
        fromBranchName: fromBranch.name,
        toBranchId: toBranch.id,
        toBranchName: toBranch.name,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        items: transferLines,
        totalQty: roundMoney(totalQty),
        totalCostValue: roundMoney(totalCostValue),
        status: 'completed',
        notes: clampStr(params.notes, 300),
        dateKey,
      };

      const destProducts = products.filter((p) => p.branchId === toBranch.id);
      const batch = writeBatch(db);

      batch.set(doc(db, 'companies', company.id, 'transfers', transferId), {
        ...transferDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const { product, qty } of params.items) {
        // Deduct from source
        batch.update(doc(db, 'companies', company.id, 'products', product.id), {
          qty: roundMoney(product.qty - qty),
          updatedAt: serverTimestamp(),
        });

        // Add or create in destination branch
        const destMatch = destProducts.find(
          (dp) =>
            dp.sku.toLowerCase() === product.sku.toLowerCase() ||
            dp.name.trim().toLowerCase() === product.name.trim().toLowerCase()
        );
        if (destMatch) {
          batch.update(doc(db, 'companies', company.id, 'products', destMatch.id), {
            qty: roundMoney(destMatch.qty + qty),
            updatedAt: serverTimestamp(),
          });
        } else {
          const newProdId = generateId('prd');
          batch.set(doc(db, 'companies', company.id, 'products', newProdId), {
            id: newProdId,
            companyId: company.id,
            ownerUid: company.ownerUid,
            memberUids: company.memberUids,
            sku: product.sku,
            name: product.name,
            category: product.category,
            price: product.price,
            wholesalePrice: product.wholesalePrice,
            cost: product.cost,
            qty,
            minStock: product.minStock,
            branchId: toBranch.id,
            branchName: toBranch.name,
            unit: product.unit,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await commitOfflineSafe(
        batch.commit(),
        OperationType.WRITE,
        `companies/${company.id}/transfers/${transferId}`
      );

      return transferDoc;
    },
    [company, activeStaff, branches, products, commitOfflineSafe]
  );

  const commitStockTake = useCallback(
    async (params: {
      branchId: string;
      actionType: StockTakeAction;
      adjustments: { product: Product; newQty: number }[];
      notes: string;
    }): Promise<StockTake> => {
      if (!company || !activeStaff) throw new Error('Active session required');
      const branch = branches.find((b) => b.id === params.branchId);
      if (!branch) throw new Error('Branch not found');

      let varianceUnits = 0;
      let varianceCostValue = 0;
      for (const adj of params.adjustments) {
        const diff = adj.newQty - adj.product.qty;
        varianceUnits += diff;
        varianceCostValue += diff * adj.product.cost;
      }

      const stockTakeId = generateId('stk');
      const trackingNumber = generateTrackingNumber('STK');
      const dateKey = getTodayDateKey();

      const stockTakeDoc: StockTake = {
        id: stockTakeId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        trackingNumber,
        branchId: branch.id,
        branchName: branch.name,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        actionType: params.actionType,
        itemsAdjusted: params.adjustments.length,
        varianceUnits: roundMoney(varianceUnits),
        varianceCostValue: roundMoney(varianceCostValue),
        notes: clampStr(params.notes, 300),
        dateKey,
      };

      const CHUNK = 400;
      for (let i = 0; i < params.adjustments.length; i += CHUNK) {
        const batch = writeBatch(db);
        const slice = params.adjustments.slice(i, i + CHUNK);
        for (const adj of slice) {
          batch.update(doc(db, 'companies', company.id, 'products', adj.product.id), {
            qty: adj.newQty,
            updatedAt: serverTimestamp(),
          });
        }
        if (i === 0) {
          batch.set(doc(db, 'companies', company.id, 'stockTakes', stockTakeId), {
            ...stockTakeDoc,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await commitOfflineSafe(
          batch.commit(),
          OperationType.WRITE,
          `companies/${company.id}/stockTakes/${stockTakeId}`
        );
      }

      if (params.adjustments.length === 0) {
        await commitOfflineSafe(
          setDoc(doc(db, 'companies', company.id, 'stockTakes', stockTakeId), {
            ...stockTakeDoc,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          OperationType.CREATE,
          `companies/${company.id}/stockTakes/${stockTakeId}`
        );
      }

      return stockTakeDoc;
    },
    [company, activeStaff, branches, commitOfflineSafe]
  );

  const processStockReturn = useCallback(
    async (params: {
      sale: Sale;
      items: { saleItem: SaleLineItem; returnQty: number }[];
      refundMethod: RefundMethod;
      restockItems: boolean;
      reason: string;
    }): Promise<StockReturn> => {
      if (!company || !activeStaff) throw new Error('Active session required');
      const validLines = params.items.filter((i) => i.returnQty > 0);
      if (validLines.length === 0) throw new Error('Select at least one item to return');

      const saleRatio = params.sale.subtotal > 0 ? (params.sale.total - params.sale.taxAmount) / params.sale.subtotal : 1;
      const taxRatio = params.sale.total > 0 ? params.sale.taxAmount / params.sale.total : 0;

      let refundSubtotal = 0;
      let refundCost = 0;
      const returnLines = validLines.map(({ saleItem, returnQty }) => {
        const maxAllowed = saleItem.qty - (saleItem.returnedQty || 0);
        const clampedQty = Math.min(returnQty, maxAllowed);
        const lineSubtotal = roundMoney(clampedQty * saleItem.unitPrice * saleRatio);
        refundSubtotal += lineSubtotal;
        refundCost += roundMoney(clampedQty * saleItem.unitCost);
        return {
          productId: saleItem.productId,
          sku: saleItem.sku,
          name: saleItem.name,
          qty: clampedQty,
          unitPrice: saleItem.unitPrice,
          unitCost: saleItem.unitCost,
          lineTotal: lineSubtotal,
        };
      });

      const refundTotal =
        taxRatio > 0 && taxRatio < 1
          ? roundMoney(refundSubtotal / (1 - taxRatio))
          : roundMoney(refundSubtotal);
      const refundTax = roundMoney(Math.max(0, refundTotal - refundSubtotal));

      const updatedSaleItems = params.sale.items.map((si) => {
        const ret = returnLines.find((r) => r.productId === si.productId);
        if (!ret) return si;
        return {
          ...si,
          returnedQty: (si.returnedQty || 0) + ret.qty,
        };
      });

      const allReturned = updatedSaleItems.every((si) => (si.returnedQty || 0) >= si.qty);
      const newReturnedAmount = roundMoney((params.sale.returnedAmount || 0) + refundTotal);

      const returnId = generateId('ret');
      const trackingNumber = generateTrackingNumber('RET');
      const dateKey = getTodayDateKey();

      const returnDoc: StockReturn = {
        id: returnId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        trackingNumber,
        saleId: params.sale.id,
        saleTrackingNumber: params.sale.trackingNumber,
        branchId: params.sale.branchId,
        branchName: params.sale.branchName,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        items: returnLines,
        refundMethod: params.refundMethod,
        refundSubtotal: roundMoney(refundSubtotal),
        refundTax,
        refundTotal,
        refundCost: roundMoney(refundCost),
        restockItems: params.restockItems,
        reason: clampStr(params.reason, 300) || 'Customer return',
        dateKey,
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'companies', company.id, 'returns', returnId), {
        ...returnDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'companies', company.id, 'sales', params.sale.id), {
        items: updatedSaleItems,
        returnedAmount: newReturnedAmount,
        status: allReturned ? 'refunded' : 'partial_return',
        updatedAt: serverTimestamp(),
      });

      if (params.restockItems) {
        for (const rLine of returnLines) {
          const prod = products.find((p) => p.id === rLine.productId);
          if (prod) {
            batch.update(doc(db, 'companies', company.id, 'products', prod.id), {
              qty: roundMoney(prod.qty + rLine.qty),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      await commitOfflineSafe(
        batch.commit(),
        OperationType.WRITE,
        `companies/${company.id}/returns/${returnId}`
      );

      return returnDoc;
    },
    [company, activeStaff, products, commitOfflineSafe]
  );

  const recordExpense = useCallback(
    async (params: {
      branchId: string;
      expenseType: ExpenseType;
      category: string;
      vendor: string;
      description: string;
      paymentMethod: 'cash' | 'card' | 'transfer' | 'credit';
      amount: number;
      taxAmount: number;
      purchaseItems?: { product: Product; qty: number; unitCost: number }[];
    }): Promise<Expense> => {
      if (!company || !activeStaff) throw new Error('Active session required');
      const branch = branches.find((b) => b.id === params.branchId) || activeBranch;
      if (!branch) throw new Error('Branch not found');

      const expenseId = generateId('exp');
      const trackingNumber = generateTrackingNumber('EXP');
      const dateKey = getTodayDateKey();

      const items: ExpenseLineItem[] = (params.purchaseItems || []).map(({ product, qty, unitCost }) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        qty,
        unitCost,
        lineTotal: roundMoney(qty * unitCost),
      }));

      const amount = roundMoney(Math.max(0, params.amount));
      const taxAmount = roundMoney(Math.max(0, params.taxAmount));
      const totalAmount = roundMoney(amount + taxAmount);

      const expenseDoc: Expense = {
        id: expenseId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        trackingNumber,
        branchId: branch.id,
        branchName: branch.name,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        expenseType: params.expenseType,
        category: clampStr(params.category, 80) || 'General',
        vendor: clampStr(params.vendor, 120),
        description: clampStr(params.description, 300) || 'Recorded expenditure',
        paymentMethod: params.paymentMethod,
        amount,
        taxAmount,
        totalAmount,
        items,
        dateKey,
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'companies', company.id, 'expenses', expenseId), {
        ...expenseDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (params.expenseType === 'inventory_purchase' && params.purchaseItems) {
        for (const pItem of params.purchaseItems) {
          batch.update(doc(db, 'companies', company.id, 'products', pItem.product.id), {
            qty: roundMoney(pItem.product.qty + pItem.qty),
            cost: Math.max(0, pItem.unitCost),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await commitOfflineSafe(
        batch.commit(),
        OperationType.WRITE,
        `companies/${company.id}/expenses/${expenseId}`
      );

      return expenseDoc;
    },
    [company, activeStaff, branches, activeBranch, commitOfflineSafe]
  );

  const commitReconciliation = useCallback(
    async (params: {
      branchId: string;
      dateKey: string;
      expectedCash: number;
      actualCash: number;
      expectedCard: number;
      actualCard: number;
      expectedTransfer: number;
      actualTransfer: number;
      cashRefunds: number;
      cashExpenses: number;
      notes: string;
    }): Promise<Reconciliation> => {
      if (!company || !activeStaff) throw new Error('Active session required');
      const branch = branches.find((b) => b.id === params.branchId) || activeBranch;
      if (!branch) throw new Error('Branch not found');

      const recId = generateId('rec');
      const trackingNumber = generateTrackingNumber('REC');

      const expectedTotal = params.expectedCash + params.expectedCard + params.expectedTransfer;
      const actualTotal = params.actualCash + params.actualCard + params.actualTransfer;
      const varianceTotal = roundMoney(actualTotal - expectedTotal);

      const recDoc: Reconciliation = {
        id: recId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        trackingNumber,
        branchId: branch.id,
        branchName: branch.name,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        dateKey: params.dateKey,
        expectedCash: roundMoney(params.expectedCash),
        actualCash: roundMoney(params.actualCash),
        expectedCard: roundMoney(params.expectedCard),
        actualCard: roundMoney(params.actualCard),
        expectedTransfer: roundMoney(params.expectedTransfer),
        actualTransfer: roundMoney(params.actualTransfer),
        cashRefunds: roundMoney(params.cashRefunds),
        cashExpenses: roundMoney(params.cashExpenses),
        varianceTotal,
        status: Math.abs(varianceTotal) < 0.01 ? 'balanced' : 'variance_noted',
        notes: clampStr(params.notes, 300),
      };

      await commitOfflineSafe(
        setDoc(doc(db, 'companies', company.id, 'reconciliations', recId), {
          ...recDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        `companies/${company.id}/reconciliations/${recId}`
      );

      return recDoc;
    },
    [company, activeStaff, branches, activeBranch, commitOfflineSafe]
  );

  const updateCompanySettings = useCallback(
    async (
      patch: Partial<
        Pick<
          Company,
          | 'name'
          | 'currency'
          | 'taxRate'
          | 'taxInclusive'
          | 'wholesaleDiscountPct'
          | 'address'
          | 'phone'
          | 'email'
          | 'receiptFooter'
          | 'allowNegativeStock'
        >
      >
    ) => {
      if (!company) return;
      await commitOfflineSafe(
        updateDoc(doc(db, 'companies', company.id), {
          ...patch,
          updatedAt: serverTimestamp(),
        }),
        OperationType.UPDATE,
        `companies/${company.id}`
      );
    },
    [company, commitOfflineSafe]
  );

  const createBranch = useCallback(
    async (data: { name: string; code: string; address: string; phone: string }): Promise<Branch> => {
      if (!company) throw new Error('No active company');
      const branchId = generateId('br');
      const branchDoc: Branch = {
        id: branchId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        name: clampStr(data.name, 80),
        code: clampStr(data.code.toUpperCase(), 20) || 'BR',
        address: clampStr(data.address, 250),
        phone: clampStr(data.phone, 40),
        isMain: false,
        active: true,
      };
      await commitOfflineSafe(
        setDoc(doc(db, 'companies', company.id, 'branches', branchId), {
          ...branchDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        `companies/${company.id}/branches/${branchId}`
      );
      return branchDoc;
    },
    [company, commitOfflineSafe]
  );

  const updateBranch = useCallback(
    async (
      branchId: string,
      patch: Partial<Pick<Branch, 'name' | 'code' | 'address' | 'phone' | 'active'>>
    ) => {
      if (!company) return;
      await commitOfflineSafe(
        updateDoc(doc(db, 'companies', company.id, 'branches', branchId), {
          ...patch,
          updatedAt: serverTimestamp(),
        }),
        OperationType.UPDATE,
        `companies/${company.id}/branches/${branchId}`
      );
    },
    [company, commitOfflineSafe]
  );

  const createStaffUser = useCallback(
    async (data: { name: string; role: StaffRole; branchId: string; pin: string }): Promise<StaffUser> => {
      if (!company) throw new Error('No active company');
      const staffId = generateId('stf');
      const pinHash = await hashPin(data.pin);
      const staffDoc: StaffUser = {
        id: staffId,
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        name: clampStr(data.name, 80),
        role: data.role,
        branchId: data.branchId || 'all',
        pinHash,
        active: true,
      };
      await commitOfflineSafe(
        setDoc(doc(db, 'companies', company.id, 'staff', staffId), {
          ...staffDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        `companies/${company.id}/staff/${staffId}`
      );
      return staffDoc;
    },
    [company, commitOfflineSafe]
  );

  const updateStaffUser = useCallback(
    async (
      staffId: string,
      patch: { name?: string; role?: StaffRole; branchId?: string; active?: boolean; newPin?: string }
    ) => {
      if (!company) return;
      const updatePayload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (patch.name !== undefined) updatePayload.name = clampStr(patch.name, 80);
      if (patch.role !== undefined) updatePayload.role = patch.role;
      if (patch.branchId !== undefined) updatePayload.branchId = patch.branchId;
      if (patch.active !== undefined) updatePayload.active = patch.active;
      if (patch.newPin) updatePayload.pinHash = await hashPin(patch.newPin);

      await commitOfflineSafe(
        updateDoc(doc(db, 'companies', company.id, 'staff', staffId), updatePayload),
        OperationType.UPDATE,
        `companies/${company.id}/staff/${staffId}`
      );
    },
    [company, commitOfflineSafe]
  );

  const value: AppContextValue = {
    firebaseUser,
    authReady,
    isLoadingData,
    isOnline,
    hasPendingSync,
    seedProgress,
    company,
    branches,
    staffUsers,
    products,
    sales,
    heldCarts,
    expenses,
    transfers,
    returns,
    stockTakes,
    reconciliations,
    activeBranchId,
    setActiveBranchId,
    activeBranch,
    activeStaff,
    cart,
    saleMode,
    setSaleMode,
    cartDiscountPct,
    setCartDiscountPct,
    activeHeldCartId,
    addToCart,
    updateCartQty,
    updateCartCustomPrice,
    removeFromCart,
    clearCart,
    signInWithGoogle,
    logoutGoogle,
    unlockWithPin,
    lockTerminal,
    createCompanyWithPreload,
    checkoutCart,
    holdCurrentCart,
    resumeHeldCart,
    deleteHeldCart,
    saveProduct,
    deleteProduct,
    importCSVProducts,
    reloadPreloadedCSV,
    transferStock,
    commitStockTake,
    processStockReturn,
    recordExpense,
    commitReconciliation,
    updateCompanySettings,
    createBranch,
    updateBranch,
    createStaffUser,
    updateStaffUser,
    darkMode,
    toggleDarkMode,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
