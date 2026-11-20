import React, { useState } from 'react';
import { Building2, KeyRound, Moon, Plus, Printer, Save, Sun, Usb, Users } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PrintEngineMode, PrintFontFamily, PrintFontSize, PrintPaperSize, Sale, StaffRole } from '../types';
import {
  PAPER_SIZE_META,
  buildEscPosReceiptBytes,
  buildReceiptHTMLDocument,
  pairUsbThermalPrinter,
  printHtmlDocumentSilently,
} from '../utils/printer';
import { PWAInstallButton } from './PWAComponents';

export const SettingsView: React.FC = () => {
  const {
    company,
    branches,
    activeBranch,
    activeStaff,
    staffUsers,
    firebaseUser,
    printSettings,
    updatePrintSettings,
    updateCompanySettings,
    createBranch,
    updateBranch,
    createStaffUser,
    updateStaffUser,
    darkMode,
    toggleDarkMode,
  } = useApp();

  const [printTestMsg, setPrintTestMsg] = useState('');
  const [isTestingPrint, setIsTestingPrint] = useState(false);

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

  const handlePairUsbPrinter = async () => {
    setPrintTestMsg('');
    try {
      const device = await pairUsbThermalPrinter();
      updatePrintSettings({
        engineMode: 'escpos_usb',
        usbVendorId: device.vendorId,
        usbProductId: device.productId,
        usbDeviceName: device.deviceName,
      });
      setPrintTestMsg(`Paired USB printer: ${device.deviceName}`);
    } catch (err) {
      setPrintTestMsg(err instanceof Error ? err.message : 'Unable to pair USB printer.');
    }
  };

  const handleTestReceiptPrint = async () => {
    if (!company || isTestingPrint) return;
    setIsTestingPrint(true);
    setPrintTestMsg('');
    try {
      const sampleSale: Sale = {
        id: 'sample_test_receipt',
        companyId: company.id,
        ownerUid: company.ownerUid,
        memberUids: company.memberUids,
        trackingNumber: 'TRX-SAMPLE-001',
        branchId: activeBranch?.id || 'main',
        branchName: activeBranch?.name || 'Main',
        staffId: activeStaff?.id || 'staff',
        staffName: activeStaff?.name || 'Operator',
        saleMode: 'retail',
        customerName: 'Test Customer',
        customerPhone: '',
        paymentMethod: 'cash',
        items: [
          {
            productId: 'p1',
            sku: 'SKU-0001',
            name: 'Amoxicillin 500mg Caps (Sample)',
            qty: 2,
            returnedQty: 0,
            unitPrice: 1200,
            unitCost: 850,
            lineTotal: 2400,
          },
          {
            productId: 'p2',
            sku: 'SKU-0002',
            name: 'Paracetamol 500mg Pack',
            qty: 1,
            returnedQty: 0,
            unitPrice: 450,
            unitCost: 300,
            lineTotal: 450,
          },
        ],
        subtotal: 2850,
        discountAmount: 0,
        taxAmount: company.taxRate > 0 ? Math.round(2850 * (company.taxRate / 100)) : 0,
        total: 2850 + (company.taxInclusive ? 0 : Math.round(2850 * (company.taxRate / 100))),
        totalCost: 2000,
        amountTendered: 5000,
        changeDue: 5000 - (2850 + (company.taxInclusive ? 0 : Math.round(2850 * (company.taxRate / 100)))),
        returnedAmount: 0,
        status: 'completed',
        notes: '',
        dateKey: new Date().toISOString().slice(0, 10),
      };

      if (printSettings.engineMode === 'escpos_usb') {
        buildEscPosReceiptBytes(sampleSale, company, printSettings);
      }
      const html = buildReceiptHTMLDocument(sampleSale, company, printSettings, { isReprint: false });
      await printHtmlDocumentSilently(html);
      setPrintTestMsg('Sent 1-page single-copy test receipt.');
    } finally {
      setIsTestingPrint(false);
    }
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

      {/* Receipt Printer & Silent Print Settings */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-teal-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Receipt Printer, Paper Size &amp; Silent Print Engine
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Renders isolated single-page, 1-copy receipts tailored to your thermal or office printer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePairUsbPrinter}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <Usb className="h-3.5 w-3.5 text-teal-600" />
              <span>Pair USB Thermal</span>
            </button>
            <button
              type="button"
              onClick={handleTestReceiptPrint}
              disabled={isTestingPrint}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 dark:shadow-none cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isTestingPrint ? 'Printing...' : 'Test Print (1 Page)'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Printer Engine Mode
            </label>
            <select
              value={printSettings.engineMode}
              onChange={(e) => updatePrintSettings({ engineMode: e.target.value as PrintEngineMode })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="silent_iframe">Isolated Single-Page Silent Driver</option>
              <option value="escpos_usb">Direct USB Thermal (WebUSB ESC/POS)</option>
              <option value="escpos_serial">Direct Serial / COM (Web Serial)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Printer Paper / Roll Size
            </label>
            <select
              value={printSettings.paperSize}
              onChange={(e) => updatePrintSettings({ paperSize: e.target.value as PrintPaperSize })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {(Object.keys(PAPER_SIZE_META) as PrintPaperSize[]).map((key) => (
                <option key={key} value={key}>
                  {PAPER_SIZE_META[key].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Receipt Typography
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={printSettings.fontFamily}
                onChange={(e) => updatePrintSettings({ fontFamily: e.target.value as PrintFontFamily })}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="mono">Fine Mono</option>
                <option value="sans">Clean Sans</option>
              </select>
              <select
                value={printSettings.fontSize}
                onChange={(e) => updatePrintSettings({ fontSize: e.target.value as PrintFontSize })}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="xs">Fine (Compact)</option>
                <option value="sm">Standard</option>
                <option value="md">Large</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Page Margin (mm) {printSettings.engineMode === 'escpos_serial' ? '· Baud Rate' : ''}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={15}
                value={printSettings.marginMm}
                onChange={(e) =>
                  updatePrintSettings({
                    marginMm: Math.max(0, Math.min(15, Number(e.target.value) || 0)),
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              {printSettings.engineMode === 'escpos_serial' && (
                <select
                  value={printSettings.serialBaudRate}
                  onChange={(e) =>
                    updatePrintSettings({ serialBaudRate: Number(e.target.value) || 9600 })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value={9600}>9600</option>
                  <option value={19200}>19200</option>
                  <option value={38400}>38400</option>
                  <option value={115200}>115200</option>
                </select>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-700 dark:text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={printSettings.autoPrintOnConfirm}
              onChange={(e) => updatePrintSettings({ autoPrintOnConfirm: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-teal-600"
            />
            <span>Auto-print 1 copy silently on &quot;Confirm and Print Receipt&quot;</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={printSettings.showItemSku}
              onChange={(e) => updatePrintSettings({ showItemSku: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-teal-600"
            />
            <span>Show SKU codes on receipt</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={printSettings.showCashierAndCustomer}
              onChange={(e) => updatePrintSettings({ showCashierAndCustomer: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-teal-600"
            />
            <span>Show cashier &amp; customer details</span>
          </label>
        </div>

        {printSettings.usbDeviceName && (
          <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
            Paired USB Device: {printSettings.usbDeviceName}
          </p>
        )}
        {printTestMsg && (
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">{printTestMsg}</p>
        )}

        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Note: Direct USB / Serial ESC/POS prints silently with zero browser dialog. For standard OS/Wi-Fi system printers, launch Chrome/Edge with{' '}
          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">--kiosk-printing</span>{' '}
          to bypass the OS confirmation dialog completely; otherwise the isolated single-page receipt prints cleanly in 1 copy without app pages bleeding through.
        </p>
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
