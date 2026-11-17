import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  Calculator,
  Lock,
  LogOut,
  Menu,
  Moon,
  Package,
  RotateCcw,
  Settings,
  ShoppingCart,
  Sun,
  X,
} from 'lucide-react';
import { AccountingExpensesView } from './components/AccountingExpensesView';
import { AuthAndOnboarding } from './components/AuthAndOnboarding';
import { InventoryView } from './components/InventoryView';
import { POSView } from './components/POSView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAComponents';
import { ReportsView } from './components/ReportsView';
import { ReturnsView } from './components/ReturnsView';
import { SettingsView } from './components/SettingsView';
import { AppProvider, useApp } from './contexts/AppContext';
import { NavSection } from './types';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('StockLedger ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendlyMessage = `Cloud sync error (${parsed.operationType || 'operation'} on ${parsed.path || 'database'}): ${parsed.error}`;
        }
      } catch {
        // Non-JSON error message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F4F8FB] dark:bg-slate-950 p-6">
          <div className="w-full max-w-lg rounded-xl border border-slate-200/90 bg-white p-7 shadow-sm shadow-slate-900/[0.04] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Workspace Sync Interrupted
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 break-words">
              {friendlyMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-700 cursor-pointer"
            >
              Reload StockLedger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'pos', label: 'POS Terminal', icon: ShoppingCart },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'returns', label: 'Returns & Refunds', icon: RotateCcw },
  { id: 'accounting', label: 'Accounting & Tax', icon: Calculator },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const AppShell: React.FC = () => {
  const {
    firebaseUser,
    authReady,
    isLoadingData,
    isOnline,
    hasPendingSync,
    seedProgress,
    company,
    branches,
    activeBranchId,
    setActiveBranchId,
    activeBranch,
    activeStaff,
    lockTerminal,
    logoutGoogle,
    darkMode,
    toggleDarkMode,
  } = useApp();

  const [activeNav, setActiveNav] = useState<NavSection>('pos');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer when switching nav or locking
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeNav, activeStaff]);

  if (!authReady || isLoadingData || seedProgress || !firebaseUser || !company || !activeStaff) {
    return <AuthAndOnboarding />;
  }

  const activeBranches = branches.filter((b) => b.active);
  const canSwitchBranch = activeStaff.branchId === 'all' && activeBranches.length > 1;
  const currentNavMeta = NAV_ITEMS.find((n) => n.id === activeNav) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#F4F8FB] text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden no-print"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-display font-bold text-xs shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:from-teal-600 dark:to-teal-600 dark:shadow-none shrink-0">
              SL
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {company.name}
              </p>
              <p className="text-[11px] font-medium text-teal-700 dark:text-slate-400 truncate">
                StockLedger Cloud
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Branch Selector */}
        <div className="p-3.5 border-b border-slate-200/80 bg-sky-50/35 dark:bg-transparent dark:border-slate-800 shrink-0">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Active Branch
          </label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-600 dark:text-slate-400" />
            <select
              value={activeBranchId}
              disabled={!canSwitchBranch}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-teal-600 focus:outline-none disabled:opacity-80 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-none"
            >
              {activeBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:text-white dark:shadow-none'
                    : 'text-slate-600 hover:bg-teal-50/75 hover:text-teal-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Operator & Session Footer */}
        <div className="p-3.5 border-t border-slate-200/80 bg-slate-50/60 dark:bg-transparent dark:border-slate-800 space-y-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/70 dark:border-transparent dark:bg-teal-500/20 dark:text-teal-300 flex items-center justify-center text-xs font-bold shrink-0">
              {activeStaff.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {activeStaff.name}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize truncate">
                {activeStaff.role}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={lockTerminal}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-teal-50/60 hover:border-teal-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Lock PIN</span>
            </button>
            <button
              type="button"
              onClick={logoutGoogle}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900 shrink-0 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold text-slate-900 dark:text-white truncate whitespace-nowrap">
              {currentNavMeta.label}
            </h1>
            {activeBranch && (
              <span className="hidden sm:inline-block text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                · {activeBranch.name}
              </span>
            )}
            {(!isOnline || hasPendingSync) && (
              <span
                className={`hidden md:inline-block text-xs font-medium whitespace-nowrap ${
                  !isOnline ? 'text-amber-700 dark:text-amber-400' : 'text-teal-700 dark:text-teal-400'
                }`}
              >
                · {!isOnline ? 'Offline Ready' : 'Syncing Changes...'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-teal-50/70 hover:text-teal-700 hover:border-teal-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={lockTerminal}
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-teal-50/70 hover:text-teal-800 hover:border-teal-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Switch User</span>
            </button>
          </div>
        </header>

        {/* Active Section Viewport */}
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {activeNav === 'pos' && <POSView />}
          {activeNav === 'inventory' && <InventoryView />}
          {activeNav === 'returns' && <ReturnsView />}
          {activeNav === 'accounting' && <AccountingExpensesView />}
          {activeNav === 'reports' && <ReportsView />}
          {activeNav === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppShell />
        <OfflineIndicator />
      </AppProvider>
    </ErrorBoundary>
  );
}
