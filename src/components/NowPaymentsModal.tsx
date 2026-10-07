import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  ShieldCheck,
  Check,
  Copy,
  RefreshCw,
  Lock,
  Coins,
  Key,
  AlertCircle
} from 'lucide-react';
import { NowPaymentsInvoice } from '../types';
import {
  createNowPaymentsInvoice,
  checkNowPaymentsStatus,
  getNowPaymentsApiKey,
  setNowPaymentsApiKey
} from '../lib/api';

interface NowPaymentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetEmail: string;
  userId?: string;
  onSuccess: () => void;
}

export const NowPaymentsModal: React.FC<NowPaymentsModalProps> = ({
  isOpen,
  onClose,
  targetEmail,
  userId,
  onSuccess
}) => {
  const [currency, setCurrency] = useState('usdttrc20');
  const [password, setPassword] = useState('');
  const [invoice, setInvoice] = useState<NowPaymentsInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState(() => getNowPaymentsApiKey());
  const [paymentStatusText, setPaymentStatusText] = useState('waiting');

  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setInvoice(null);
      setIsSuccess(false);
      setError(null);
      setPaymentStatusText('waiting');
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen]);

  // Automatic real blockchain polling while invoice is active
  useEffect(() => {
    if (invoice && !isSuccess) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusData = await checkNowPaymentsStatus(invoice.payment_id);
          setPaymentStatusText(statusData.payment_status);
          if (statusData.is_confirmed) {
            setIsSuccess(true);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 1800);
          }
        } catch {
          // Keep polling silently
        }
      }, 7000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [invoice, isSuccess, onSuccess, onClose]);

  if (!isOpen) return null;

  const handleCreateInvoice = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (customApiKey.trim()) {
        setNowPaymentsApiKey(customApiKey.trim());
      }
      const inv = await createNowPaymentsInvoice(
        targetEmail,
        currency,
        userId,
        customApiKey.trim() || undefined
      );
      setInvoice(inv);
      setPaymentStatusText(inv.payment_status || 'waiting');
    } catch (err: any) {
      setError(err.message || 'Failed to create real NOWPayments invoice');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!invoice) return;
    setIsChecking(true);
    setError(null);
    try {
      const statusData = await checkNowPaymentsStatus(invoice.payment_id);
      setPaymentStatusText(statusData.payment_status);
      if (statusData.is_confirmed) {
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Status check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134] animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#303134]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#fbbc04]" />
            <h2 className="text-base font-medium text-white">Reserve Email ($1.11 / year)</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-medium text-white">Payment Confirmed!</h3>
            <p className="text-xs text-[#8e918f]">
              <span className="text-white font-mono">{targetEmail}</span> is now reserved exclusively for you forever.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="p-3.5 bg-[#121212] border border-[#303134] rounded-2xl">
              <p className="text-xs text-[#8e918f] mb-1">Target Address to Reserve:</p>
              <p className="text-sm font-mono text-[#8ab4f8] font-medium">{targetEmail || 'custom@goldmailer.xyz'}</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#303134] text-xs">
                <span className="text-[#8e918f]">Annual Price:</span>
                <span className="font-bold text-[#fbbc04] font-mono">$1.11 USD</span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {!invoice ? (
              <div className="space-y-4">
                {/* Password input */}
                <div>
                  <label className="block text-xs font-medium text-[#8e918f] mb-1">
                    Set Secret Access Password (Optional)
                  </label>
                  <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] px-3 py-2.5">
                    <Lock className="w-4 h-4 text-[#8e918f] mr-2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password for this reserved mailbox"
                      className="w-full bg-transparent text-white text-xs outline-none"
                    />
                  </div>
                </div>

                {/* Cryptocurrency selection */}
                <div>
                  <label className="block text-xs font-medium text-[#8e918f] mb-1">
                    Select Payment Cryptocurrency (NOWPayments Gateway)
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-[#121212] border border-[#303134] text-white rounded-xl px-3 py-2.5 text-xs outline-none"
                  >
                    <option value="usdttrc20">USDT (TRC-20 Tron Network) - Lowest Fee</option>
                    <option value="usdterc20">USDT (ERC-20 Ethereum)</option>
                    <option value="btc">Bitcoin (BTC)</option>
                    <option value="eth">Ethereum (ETH)</option>
                    <option value="sol">Solana (SOL)</option>
                    <option value="ltc">Litecoin (LTC)</option>
                  </select>
                </div>

                {/* Optional Custom NOWPayments API Key */}
                <div>
                  <label className="block text-[11px] font-medium text-[#8e918f] mb-1">
                    NOWPayments API Key (Optional override if not in server env)
                  </label>
                  <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] px-3 py-2">
                    <Key className="w-3.5 h-3.5 text-[#8e918f] mr-2" />
                    <input
                      type="text"
                      value={customApiKey}
                      onChange={(e) => {
                        setCustomApiKey(e.target.value);
                        setNowPaymentsApiKey(e.target.value);
                      }}
                      placeholder="e.g. 5V6P... (leave blank to use server key)"
                      className="w-full bg-transparent text-white text-xs outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  onClick={handleCreateInvoice}
                  disabled={isLoading}
                  className="w-full py-3 rounded-2xl bg-[#0b57d0] hover:bg-[#1a73e8] text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-50"
                >
                  <Coins className="w-4 h-4" />
                  <span>{isLoading ? 'Connecting to NOWPayments...' : 'Generate Real Crypto Invoice ($1.11)'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 bg-[#121212] border border-[#303134] rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#8e918f]">Send Exact Amount:</span>
                    <span className="font-bold text-white font-mono text-sm">
                      {invoice.pay_amount} {invoice.pay_currency}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-[#8e918f] block mb-1">Deposit Address:</span>
                    <div className="flex items-center gap-2 bg-[#1e1f20] p-2.5 rounded-xl border border-white/5 font-mono text-xs text-[#8ab4f8] break-all">
                      <span className="flex-1">{invoice.pay_address}</span>
                      <button
                        onClick={() => handleCopy(invoice.pay_address)}
                        className="p-1 text-[#8e918f] hover:text-white"
                        title="Copy address"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                    <span className="text-[#8e918f]">Status:</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 capitalize">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      {paymentStatusText}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={handleCheckStatus}
                    disabled={isChecking}
                    className="w-full py-2.5 rounded-xl bg-[#2d2f31] hover:bg-[#3c4043] text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                    <span>{isChecking ? 'Checking Blockchain...' : 'Check Payment Status'}</span>
                  </button>
                  <p className="text-center text-[11px] text-[#8e918f]">
                    Status auto-refreshes every few seconds once your blockchain transfer is detected.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
