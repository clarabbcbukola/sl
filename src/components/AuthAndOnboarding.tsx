import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Delete,
  KeyRound,
  Lock,
  LogOut,
  PackageCheck,
  ShieldCheck,
  Store,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PWAInstallButton } from './PWAComponents';

export const AuthAndOnboarding: React.FC = () => {
  const {
    firebaseUser,
    authReady,
    isLoadingData,
    isOnline,
    seedProgress,
    company,
    branches,
    staffUsers,
    activeStaff,
    signInWithGoogle,
    logoutGoogle,
    unlockWithPin,
    createCompanyWithPreload,
  } = useApp();

  // Company Creation Wizard State
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('₦');
  const [taxRate, setTaxRate] = useState('7.5');
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [wholesaleDiscountPct, setWholesaleDiscountPct] = useState('10');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState(firebaseUser?.displayName || 'Store Owner');
  const [ownerPin, setOwnerPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [preloadCatalog, setPreloadCatalog] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // PIN Lock State
  const activeStaffList = staffUsers.filter((s) => s.active);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (firebaseUser?.displayName && !ownerName) {
      setOwnerName(firebaseUser.displayName);
    }
  }, [firebaseUser?.displayName, ownerName]);

  useEffect(() => {
    if (activeStaffList.length > 0 && !activeStaffList.some((s) => s.id === selectedStaffId)) {
      setSelectedStaffId(activeStaffList[0].id);
    }
  }, [activeStaffList, selectedStaffId]);

  const handlePinSubmit = async (code = pinInput) => {
    if (!selectedStaffId || code.length < 4) {
      setPinError('Enter at least 4 digits for your PIN');
      return;
    }
    const ok = await unlockWithPin(selectedStaffId, code);
    if (!ok) {
      setPinError('Incorrect PIN. Please try again.');
      setPinInput('');
    } else {
      setPinError('');
      setPinInput('');
    }
  };

  // Keyboard listener for PIN screen
  useEffect(() => {
    if (!company || activeStaff) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setPinError('');
        setPinInput((prev) => (prev.length < 6 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        setPinInput((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        handlePinSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!authReady || isLoadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-teal-50/70 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-8 text-center shadow-sm shadow-slate-900/[0.04] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="mx-auto h-10 w-10 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-display font-bold text-lg shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:from-teal-600 dark:to-teal-600 dark:shadow-none">
            SL
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            Syncing StockLedger Cloud
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Connecting to your multi-branch store database...
          </p>
          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-teal-600" />
          </div>
        </div>
      </div>
    );
  }

  // Seeding progress overlay
  if (seedProgress) {
    const pct = seedProgress.total > 0 ? Math.round((seedProgress.current / seedProgress.total) * 100) : 0;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Preparing Your Inventory
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{seedProgress.label}</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 font-mono tabular-nums">
              <span>{seedProgress.current} / {seedProgress.total} items</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 1. Google Cloud Sign-In
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-teal-50/70 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 flex flex-col">
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-display font-bold text-sm shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:from-teal-600 dark:to-teal-600 dark:shadow-none">
              SL
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              StockLedger
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center space-y-5">
              <p className="text-xs font-semibold tracking-wide text-teal-700 dark:text-teal-400">
                Multi-Branch Retail &amp; Wholesale Suite
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance]">
                One synchronized ledger for every counter, branch, and stockroom.
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Run fast wholesale and retail checkouts, hold and resume carts, transfer stock across branches, record inventory purchases and expenses, and reconcile daily cash and tax from any device.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Real-Time Cloud Sync</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Sign in anywhere and unlock your terminal with your staff PIN.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Preloaded Inventory</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Starts ready with your full 740+ item catalog, costs, and stock counts.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200/90 bg-white p-7 flex flex-col justify-between shadow-sm shadow-slate-900/[0.04] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:from-teal-600 dark:to-teal-600 dark:shadow-none">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
                  Sign in to Workspace
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Connect your Google account to create your company or access your synchronized branches across devices.
                </p>

                {!isOnline && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
                    Internet is required to open &amp; sign in initially. Once signed in, all store operations work offline and sync automatically.
                  </div>
                )}

                {authError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
                    {authError}
                  </div>
                )}
              </div>

              <div className="mt-8 space-y-3">
                <button
                  type="button"
                  onClick={async () => {
                    if (!isOnline) {
                      setAuthError('Connect to the internet to complete Google Sign-In.');
                      return;
                    }
                    setAuthError('');
                    try {
                      await signInWithGoogle();
                    } catch (err) {
                      setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled or failed.');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-3 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 transition-colors dark:bg-teal-600 dark:hover:bg-teal-700 dark:shadow-none cursor-pointer"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Offline-capable PWA · All branches &amp; PINs retained in cloud
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 2. Company Setup Wizard (First-Time Creation)
  if (!company) {
    const handleCreateCompany = async (e: React.FormEvent) => {
      e.preventDefault();
      setSetupError('');
      if (!companyName.trim()) {
        setSetupError('Please enter your company or store name.');
        return;
      }
      if (!ownerName.trim()) {
        setSetupError('Please enter the primary user name.');
        return;
      }
      if (!/^\d{4,6}$/.test(ownerPin)) {
        setSetupError('PIN must be 4 to 6 numeric digits.');
        return;
      }
      if (ownerPin !== confirmPin) {
        setSetupError('PIN and Confirm PIN do not match.');
        return;
      }

      setIsCreating(true);
      try {
        await createCompanyWithPreload({
          companyName: companyName.trim(),
          currency,
          taxRate: Number.parseFloat(taxRate) || 0,
          taxInclusive,
          wholesaleDiscountPct: Number.parseFloat(wholesaleDiscountPct) || 0,
          address,
          phone,
          ownerName: ownerName.trim(),
          ownerPin,
          preloadCatalog,
        });
      } catch (err) {
        setSetupError(err instanceof Error ? err.message : 'Failed to create company.');
      } finally {
        setIsCreating(false);
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-teal-50/70 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 flex flex-col">
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-display font-bold text-sm shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:from-teal-600 dark:to-teal-600 dark:shadow-none">
              SL
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">StockLedger</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              {firebaseUser.email}
            </span>
            <button
              type="button"
              onClick={logoutGoogle}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <form
            onSubmit={handleCreateCompany}
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Create Your Company Workspace
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Set up your business profile, tax rules, and owner login PIN. Everything syncs across your devices.
                </p>
              </div>
              <Building2 className="h-6 w-6 text-teal-600 shrink-0" />
            </div>

            {setupError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
                {setupError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Company / Store Name
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., GraceMed Pharmacy & Supermarket"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Currency Symbol
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="₦">₦ (NGN - Naira)</option>
                  <option value="$">$ (USD - Dollar)</option>
                  <option value="£">£ (GBP - Pound)</option>
                  <option value="€">€ (EUR - Euro)</option>
                  <option value="₵">₵ (GHS - Cedi)</option>
                  <option value="KSh">KSh (KES - Shilling)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Default Sales Tax / VAT (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Default Wholesale Discount (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="95"
                  value={wholesaleDiscountPct}
                  onChange={(e) => setWholesaleDiscountPct(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tax Calculation Mode
                </label>
                <select
                  value={taxInclusive ? 'inclusive' : 'exclusive'}
                  onChange={(e) => setTaxInclusive(e.target.value === 'inclusive')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="exclusive">Tax Exclusive (Added at checkout)</option>
                  <option value="inclusive">Tax Inclusive (Included in price)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Main Branch Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Optional street address"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Business Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional contact number"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                Primary Owner Profile &amp; Login PIN
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Create PIN (4-6 digits)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 1234"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Confirm PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Repeat PIN"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50/70 p-4 cursor-pointer dark:border-teal-900/60 dark:bg-teal-950/30">
              <input
                type="checkbox"
                checked={preloadCatalog}
                onChange={(e) => setPreloadCatalog(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
              />
              <div className="text-sm">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Preload attached inventory catalog (740+ items into Main branch)
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Automatically imports all product names, retail prices, unit costs, and stock quantities from your inventory CSV.
                </p>
              </div>
            </label>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-60 transition-colors dark:bg-teal-600 dark:hover:bg-teal-700 dark:shadow-none cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isCreating ? 'Creating Company & Syncing Stock...' : 'Create Company & Launch POS'}</span>
            </button>
          </form>
        </main>
      </div>
    );
  }

  // 3. Staff User + PIN Terminal Lock Screen
  const selectedStaff = activeStaffList.find((s) => s.id === selectedStaffId) || activeStaffList[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-teal-50/70 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 flex flex-col">
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-display font-bold text-sm shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:from-teal-600 dark:to-teal-600 dark:shadow-none shrink-0">
            SL
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white truncate">
            {company.name}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={logoutGoogle}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Switch Google Account</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          {/* Staff Selector */}
          <div className="md:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Select Operator
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {branches.length} {branches.length === 1 ? 'branch' : 'branches'} synced
                </p>
              </div>
              <Store className="h-5 w-5 text-slate-400" />
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto max-h-80">
              {activeStaffList.map((staff) => {
                const isSelected = staff.id === selectedStaff?.id;
                const branchLabel =
                  staff.branchId === 'all'
                    ? 'All Branches'
                    : branches.find((b) => b.id === staff.branchId)?.name || 'Assigned Branch';
                return (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => {
                      setSelectedStaffId(staff.id);
                      setPinInput('');
                      setPinError('');
                    }}
                    className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/70 dark:border-teal-500 dark:bg-teal-950/40'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0 ${
                          isSelected
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {staff.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {staff.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize truncate">
                          {staff.role} · {branchLabel}
                        </p>
                      </div>
                    </div>
                    {isSelected && <UserCheck className="h-4 w-4 text-teal-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN Pad */}
          <div className="md:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-teal-600" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Enter PIN to Unlock
                  </h2>
                </div>
                {selectedStaff && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {selectedStaff.name}
                  </span>
                )}
              </div>

              {/* PIN Display Dots */}
              <div className="mt-5 flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50 py-3.5 dark:border-slate-800 dark:bg-slate-950">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    className={`h-3 w-3 rounded-full transition-colors ${
                      idx < pinInput.length
                        ? 'bg-teal-600 dark:bg-teal-400'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  />
                ))}
              </div>

              {pinError && (
                <p className="mt-2.5 text-center text-xs font-medium text-red-600 dark:text-red-400">
                  {pinError}
                </p>
              )}

              {/* Numeric Keypad */}
              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => {
                      setPinError('');
                      setPinInput((prev) => (prev.length < 6 ? prev + digit : prev));
                    }}
                    className="h-12 rounded-lg border border-slate-200 bg-white text-base font-semibold font-mono text-slate-900 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError('');
                  }}
                  className="h-12 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinError('');
                    setPinInput((prev) => (prev.length < 6 ? prev + '0' : prev));
                  }}
                  className="h-12 rounded-lg border border-slate-200 bg-white text-base font-semibold font-mono text-slate-900 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800 cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                  aria-label="Backspace"
                  className="h-12 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                >
                  <Delete className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handlePinSubmit()}
              disabled={pinInput.length < 4}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-3 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-40 transition-colors dark:bg-teal-600 dark:hover:bg-teal-700 dark:shadow-none cursor-pointer"
            >
              <KeyRound className="h-4 w-4" />
              <span>Unlock Terminal</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
