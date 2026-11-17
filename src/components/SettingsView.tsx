import React, { useState } from 'react';
import { Building2, KeyRound, Moon, Plus, Save, Sun, Users } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { StaffRole } from '../types';
import { PWAInstallButton } from './PWAComponents';

export const SettingsView: React.FC = () => {
  const {
    company,
    branches,
    staffUsers,
    firebaseUser,
    updateCompanySettings,
    createBranch,
    updateBranch,
    createStaffUser,
    updateStaffUser,
    darkMode,
    toggleDarkMode,
  } = useApp();

  // Company Form
  const [compName, setCompName] = useState(company?.name || '');
  const [currency, setCurrency] = useState(company?.currency || '₦');
  const [taxRate, setTaxRate] = useState(String(company?.taxRate ?? 7.5));
  const [taxInclusive, setTaxInclusive] = useState(company?.taxInclusive ?? false);
  const [wholesaleDiscountPct, setWholesaleDiscountPct] = useState(
    String(company?.wholesaleDiscountPct ?? 10)
  );
  const [allowNegativeStock, setAllowNegativeStock] = useState(company?.allowNegativeStock ?? false);
  const [address, setAddress] = useState(company?.address || '');
  const [phone, setPhone] = useState(company?.phone || '');
  const [receiptFooter, setReceiptFooter] = useState(company?.receiptFooter || '');
  const [compSavedMsg, setCompSavedMsg] = useState('');

  // New Branch Form
  const [brName, setBrName] = useState('');
  const [brCode, setBrCode] = useState('');
  const [brAddress, setBrAddress] = useState('');
  const [brPhone, setBrPhone] = useState('');
  const [brMsg, setBrMsg] = useState('');

  // New Staff Form
  const [stName, setStName] = useState('');
  const [stRole, setStRole] = useState<StaffRole>('cashier');
  const [stBranchId, setStBranchId] = useState('all');
  const [stPin, setStPin] = useState('');
  const [stMsg, setStMsg] = useState('');

  // PIN Reset Inline
  const [resettingStaffId, setResettingStaffId] = useState<string | null>(null);
  const [newPinValue, setNewPinValue] = useState('');

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompSavedMsg('');
    await updateCompanySettings({
      name: compName,
      currency,
      taxRate: Math.max(0, Math.min(100, Number.parseFloat(taxRate) || 0)),
      taxInclusive,
      wholesaleDiscountPct: Math.max(0, Math.min(95, Number.parseFloat(wholesaleDiscountPct) || 0)),
      allowNegativeStock,
      address,
      phone,
      receiptFooter,
    });
    setCompSavedMsg('Company & tax settings saved and synced.');
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brName.trim()) return;
    await createBranch({
      name: brName.trim(),
      code: brCode.trim() || brName.trim().slice(0, 4).toUpperCase(),
      address: brAddress,
      phone: brPhone,
    });
    setBrName('');
    setBrCode('');
    setBrAddress('');
    setBrPhone('');
    setBrMsg('Branch added and synchronized.');
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStMsg('');
    if (!stName.trim()) return;
    if (!/^\d{4,6}$/.test(stPin)) {
      setStMsg('PIN must be 4 to 6 digits.');
      return;
    }
    await createStaffUser({
      name: stName.trim(),
      role: stRole,
      branchId: stBranchId,
      pin: stPin,
    });
    setStName('');
    setStPin('');
    setStMsg('Staff user & PIN created. Ready for login across all devices.');
  };

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Appearance & Cloud Session Strip */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Workspace Preferences &amp; Cloud Sync
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Signed in as <span className="font-semibold">{firebaseUser?.email}</span> · Company ID:{' '}
            <span className="font-mono">{company?.id}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PWAInstallButton />
          <button
            type="button"
            onClick={toggleDarkMode}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
          >
            {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Company & Tax Config */}
        <form
          onSubmit={handleSaveCompany}
          className="lg:col-span-6 rounded-xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Building2 className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Company Profile, Tax &amp; POS Rules
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Company Name
              </label>
              <input
                type="text"
                required
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Currency Symbol
              </label>
              <input
                type="text"
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tax / VAT Rate (%)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tax Mode
              </label>
              <select
                value={taxInclusive ? 'inclusive' : 'exclusive'}
                onChange={(e) => setTaxInclusive(e.target.value === 'inclusive')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="exclusive">Exclusive (Added on subtotal)</option>
                <option value="inclusive">Inclusive (Extracted from price)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Default Wholesale Discount (%)
              </label>
              <input
                type="number"
                min={0}
                max={95}
                value={wholesaleDiscountPct}
                onChange={(e) => setWholesaleDiscountPct(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Receipt Footer Note
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allowNegativeStock}
              onChange={(e) => setAllowNegativeStock(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600"
            />
            <span>Allow selling out-of-stock items (negative stock override)</span>
          </label>

          {compSavedMsg && (
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">{compSavedMsg}</p>
          )}

          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Company Settings</span>
          </button>
        </form>

        {/* Branches Management */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800">
              Store Branches ({branches.length})
            </h3>

            <div className="space-y-2">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs dark:border-slate-800"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {b.name}{' '}
                      <span className="font-mono font-normal text-slate-400">({b.code})</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {b.isMain ? 'Primary Branch' : 'Secondary Branch'} {b.address ? `· ${b.address}` : ''}
                    </p>
                  </div>
                  {!b.isMain && (
                    <button
                      type="button"
                      onClick={() => updateBranch(b.id, { active: !b.active })}
                      className={`rounded px-2.5 py-1 font-semibold cursor-pointer ${
                        b.active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                      }`}
                    >
                      {b.active ? 'Active' : 'Inactive'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleCreateBranch} className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Add New Store Branch
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={brName}
                  onChange={(e) => setBrName(e.target.value)}
                  placeholder="Branch Name (e.g. Ikeja Annex)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <input
                  type="text"
                  value={brCode}
                  onChange={(e) => setBrCode(e.target.value)}
                  placeholder="Code (e.g. IKJ)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <input
                  type="text"
                  value={brAddress}
                  onChange={(e) => setBrAddress(e.target.value)}
                  placeholder="Branch Address (optional)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <input
                  type="text"
                  value={brPhone}
                  onChange={(e) => setBrPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              {brMsg && <p className="text-xs font-semibold text-teal-700">{brMsg}</p>}
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 dark:shadow-none cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Branch</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Staff Users & PIN Management */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <Users className="h-4 w-4 text-teal-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Staff Operators &amp; PIN Credentials
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create staff users with 4–6 digit PINs. Retained across all synced devices.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-2.5">
            {staffUsers.map((st) => {
              const branchName =
                st.branchId === 'all'
                  ? 'All Branches'
                  : branches.find((b) => b.id === st.branchId)?.name || 'Branch';
              return (
                <div
                  key={st.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5 text-xs dark:border-slate-800"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{st.name}</p>
                    <p className="text-slate-500 capitalize">
                      {st.role} · {branchName} · {st.active ? 'Active' : 'Suspended'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {resettingStaffId === st.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={newPinValue}
                          onChange={(e) => setNewPinValue(e.target.value.replace(/\D/g, ''))}
                          placeholder="New PIN"
                          className="w-24 rounded border border-slate-300 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (/^\d{4,6}$/.test(newPinValue)) {
                              await updateStaffUser(st.id, { newPin: newPinValue });
                              setResettingStaffId(null);
                              setNewPinValue('');
                            }
                          }}
                          className="rounded bg-teal-600 px-2.5 py-1 text-white font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setResettingStaffId(st.id);
                          setNewPinValue('');
                        }}
                        className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <KeyRound className="h-3 w-3" />
                        <span>Change PIN</span>
                      </button>
                    )}

                    {st.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => updateStaffUser(st.id, { active: !st.active })}
                        className={`rounded px-2.5 py-1 font-semibold cursor-pointer ${
                          st.active
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        }`}
                      >
                        {st.active ? 'Suspend' : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleCreateStaff}
            className="lg:col-span-5 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-950"
          >
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              Create New Staff User &amp; PIN
            </h4>
            <input
              type="text"
              required
              value={stName}
              onChange={(e) => setStName(e.target.value)}
              placeholder="Staff Full Name"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={stRole}
                onChange={(e) => setStRole(e.target.value as StaffRole)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Branch Manager</option>
                <option value="accountant">Accountant</option>
                <option value="owner">Co-Owner</option>
              </select>
              <select
                value={stBranchId}
                onChange={(e) => setStBranchId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={stPin}
              onChange={(e) => setStPin(e.target.value.replace(/\D/g, ''))}
              placeholder="4–6 Digit Login PIN"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tracking-widest dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            {stMsg && <p className="text-xs font-semibold text-teal-700">{stMsg}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
            >
              Add Staff User
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
