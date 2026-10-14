import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  MessageSquare,
  Send,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Coins,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall as PhoneCallIcon,
  Users,
  Search,
  UserPlus,
  Clock,
  ShieldCheck,
  X,
  CreditCard,
  ArrowLeft,
  MoreVertical,
  Smile,
  Image as ImageIcon,
  Paperclip,
  Loader2,
  QrCode,
  Wallet,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Sparkles,
  Shield
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  SMSMessage,
  UserPhoneNumber,
  AvailablePhoneNumber,
  UserProfile,
  PhoneCall,
  PhoneContact,
  UserWallet,
  WalletTransaction,
  ESimProfile
} from '../types';
import {
  fetchUserPhoneNumbers,
  fetchAvailablePhoneNumbers,
  fetchSmsInbox,
  sendSmsMessage,
  createPhoneBuyIntent,
  extendPhoneSubscription,
  deleteSms,
  clearAllSms,
  fetchPhoneCalls,
  makePhoneCall,
  deletePhoneCall,
  clearAllPhoneCalls,
  fetchPhoneContacts,
  savePhoneContact,
  deletePhoneContact,
  provisionAdminNumber,
  fetchUserWallet,
  rechargeWallet,
  fetchUserEsim
} from '../lib/api';

interface PhoneHubViewProps {
  user: UserProfile | null;
  darkMode: boolean;
  onOpenEmail: () => void;
}

interface ConversationThread {
  number: string;
  contact?: PhoneContact;
  name: string;
  initial: string;
  messages: SMSMessage[];
  lastMessage: SMSMessage;
}

export const PhoneHubView: React.FC<PhoneHubViewProps> = ({
  user,
  darkMode,
  onOpenEmail
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'contacts' | 'calls' | 'history' | 'buy' | 'wallet' | 'esim'>('inbox');
  const [phoneNumbers, setPhoneNumbers] = useState<UserPhoneNumber[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [contacts, setContacts] = useState<PhoneContact[]>([]);

  // User Wallet & Coin State
  const [walletData, setWalletData] = useState<{
    coins: number;
    unlimited: boolean;
    expiresAt: string;
    daysRemaining: number;
    numbersCount: number;
    transactions: WalletTransaction[];
  } | null>(null);

  // Manual Renewal / Re-subscribe Modal State
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState<number>(6);
  const [customRechargeAmount, setCustomRechargeAmount] = useState<string>('6');
  const [isGeneratingRechargeInvoice, setIsGeneratingRechargeInvoice] = useState(false);
  const [rechargeInvoiceUrl, setRechargeInvoiceUrl] = useState<string | null>(null);
  const [rechargeNotice, setRechargeNotice] = useState<string | null>(null);
  const [rechargeDetails, setRechargeDetails] = useState<any | null>(null);

  // eSIM Profile State (Users only, not admin)
  const [esimProfile, setEsimProfile] = useState<ESimProfile | null>(null);
  const [esimQrUrl, setEsimQrUrl] = useState<string | null>(null);
  const [isLoadingEsim, setIsLoadingEsim] = useState(false);
  const [esimGuideTab, setEsimGuideTab] = useState<'ios' | 'android'>('ios');

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Google Messages Chat View State
  const [activeThreadNumber, setActiveThreadNumber] = useState<string | null>(null);
  const [isComposingNewChat, setIsComposingNewChat] = useState(false);
  const [newChatRecipient, setNewChatRecipient] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [selectedFromNumber, setSelectedFromNumber] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showThreadMenu, setShowThreadMenu] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Direct Voice Calling State (No Text-to-Speech)
  const [callRecipient, setCallRecipient] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [callResult, setCallResult] = useState<{ success: boolean; message: string } | null>(null);

  // Contacts Management State
  const [contactSearch, setContactSearch] = useState('');
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactNotes, setNewContactNotes] = useState('');
  const [isSavingContact, setIsSavingContact] = useState(false);

  // NOWPayments Checkout State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedNumberToBuy, setSelectedNumberToBuy] = useState<AvailablePhoneNumber | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [isAdminProvisioning, setIsAdminProvisioning] = useState(false);
  const [adminProvisionNotice, setAdminProvisionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = user?.email === 'miracle@goldmailer.xyz' || user?.role === 'admin';
  const activeNumber = phoneNumbers[0] || null;

  // Load real data exclusively
  const loadPhoneData = async () => {
    setIsLoading(true);
    try {
      const [phonesRes, smsRes, availRes, callsRes, contactsRes, walletRes, esimRes] = await Promise.allSettled([
        fetchUserPhoneNumbers(),
        fetchSmsInbox(),
        fetchAvailablePhoneNumbers(),
        fetchPhoneCalls(),
        fetchPhoneContacts(),
        fetchUserWallet(),
        !isAdmin ? fetchUserEsim() : Promise.resolve(null)
      ]);

      if (phonesRes.status === 'fulfilled' && phonesRes.value.numbers && phonesRes.value.numbers.length > 0) {
        setPhoneNumbers(phonesRes.value.numbers);
        setSelectedFromNumber(phonesRes.value.numbers[0].phoneNumber);
      } else {
        setPhoneNumbers([]);
        setSelectedFromNumber('');
      }

      if (smsRes.status === 'fulfilled') setMessages(smsRes.value);
      if (callsRes.status === 'fulfilled') setCalls(callsRes.value);
      if (contactsRes.status === 'fulfilled') setContacts(contactsRes.value);

      if (availRes.status === 'fulfilled') {
        const pList = phonesRes.status === 'fulfilled' ? phonesRes.value.numbers || [] : [];
        const boughtNumbers = new Set(pList.map((p: any) => p.phoneNumber.replace(/[^\d+]/g, '')));
        if (phonesRes.status === 'fulfilled' && phonesRes.value.adminNumber) {
          boughtNumbers.add(phonesRes.value.adminNumber.replace(/[^\d+]/g, ''));
        }
        const unboughtAvail = (availRes.value || []).filter(
          (a: any) => !boughtNumbers.has(a.phoneNumber.replace(/[^\d+]/g, ''))
        );
        setAvailableNumbers(unboughtAvail);
      }

      if (walletRes.status === 'fulfilled' && walletRes.value && walletRes.value.success) {
        setWalletData(walletRes.value);
      }

      if (esimRes.status === 'fulfilled' && esimRes.value && esimRes.value.success && esimRes.value.esim) {
        setEsimProfile(esimRes.value.esim);
        if (esimRes.value.esim.lpaString) {
          QRCode.toDataURL(esimRes.value.esim.lpaString, { width: 240, margin: 2 })
            .then(url => setEsimQrUrl(url))
            .catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Failed to load phone data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPhoneData();
  }, [user?.email]);

  // Real-time EventSource listener for incoming SMS & Calls
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/emails/stream');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_sms' && data.sms) {
            setMessages((prev) => [data.sms, ...prev.filter(m => m.id !== data.sms.id)]);
          } else if (data.type === 'new_call' && data.call) {
            setCalls((prev) => [data.call, ...prev.filter(c => c.id !== data.call.id)]);
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Auto-scroll chat to bottom when thread updates
  useEffect(() => {
    if (activeThreadNumber && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThreadNumber, messages]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadPhoneData();
    setIsRefreshing(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Group messages into Google Messages style threads
  const conversationThreads: ConversationThread[] = React.useMemo(() => {
    const threadMap: { [num: string]: SMSMessage[] } = {};

    messages.forEach((m) => {
      const otherNum = m.direction === 'outbound' ? m.to : m.from;
      if (!otherNum) return;
      if (!threadMap[otherNum]) threadMap[otherNum] = [];
      threadMap[otherNum].push(m);
    });

    return Object.keys(threadMap).map((num) => {
      const threadMsgs = threadMap[num].sort(
        (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      );
      const matchedContact = contacts.find(
        (c) => c.phoneNumber.replace(/\D/g, '') === num.replace(/\D/g, '')
      );
      const displayName = matchedContact?.name || num;
      const initial = displayName.replace(/^\+/, '').charAt(0).toUpperCase() || 'G';
      return {
        number: num,
        contact: matchedContact,
        name: displayName,
        initial,
        messages: threadMsgs,
        lastMessage: threadMsgs[threadMsgs.length - 1]
      };
    }).sort((a, b) => new Date(b.lastMessage.receivedAt).getTime() - new Date(a.lastMessage.receivedAt).getTime());
  }, [messages, contacts]);

  const currentThread = React.useMemo(() => {
    if (!activeThreadNumber) return null;
    return conversationThreads.find(t => t.number === activeThreadNumber) || {
      number: activeThreadNumber,
      contact: contacts.find(c => c.phoneNumber.replace(/\D/g, '') === activeThreadNumber.replace(/\D/g, '')),
      name: contacts.find(c => c.phoneNumber.replace(/\D/g, '') === activeThreadNumber.replace(/\D/g, ''))?.name || activeThreadNumber,
      initial: (contacts.find(c => c.phoneNumber.replace(/\D/g, '') === activeThreadNumber.replace(/\D/g, ''))?.name || activeThreadNumber).replace(/^\+/, '').charAt(0).toUpperCase() || 'G',
      messages: messages.filter(m => (m.direction === 'outbound' ? m.to : m.from) === activeThreadNumber).sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()),
      lastMessage: messages.filter(m => (m.direction === 'outbound' ? m.to : m.from) === activeThreadNumber)[0]
    };
  }, [activeThreadNumber, conversationThreads, contacts, messages]);

  // Place Call Handler (Direct SignalWire Voice Calling)
  const handleMakeCall = async (e?: React.FormEvent, directNumber?: string) => {
    if (e) e.preventDefault();
    const rawTarget = directNumber || callRecipient.trim();
    if (!rawTarget) return;

    // Normalize phone number (handling Nigerian 0916... and US numbers)
    let target = rawTarget.replace(/[\s\-\(\)]/g, '');
    if (target.startsWith('0') && target.length === 11) {
      target = '+234' + target.slice(1);
    } else if (target.length === 10 && !target.startsWith('+')) {
      target = '+1' + target;
    } else if (!target.startsWith('+')) {
      target = '+' + target;
    }

    if (!activeNumber && !isAdmin) {
      setActiveTab('buy');
      return;
    }

    setIsCalling(true);
    setCallResult(null);

    try {
      const res = await makePhoneCall({
        to: target,
        from: selectedFromNumber || activeNumber?.phoneNumber || ''
      });

      if (res.success) {
        setCallResult({
          success: true,
          message: `Direct voice call dispatched to ${target}. Connecting...`
        });
        if (res.call) {
          setCalls(prev => [res.call!, ...prev]);
        }
      } else {
        setCallResult({
          success: false,
          message: res.error || 'Failed to place call'
        });
      }
    } catch (err: any) {
      setCallResult({
        success: false,
        message: err.message || 'Error occurred while placing voice call'
      });
    } finally {
      setIsCalling(false);
    }
  };

  // Delete Single Call Record
  const handleDeleteCall = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCalls(prev => prev.filter(c => c.id !== id));
    try {
      await deletePhoneCall(id);
    } catch {}
  };

  // Clear All Calls
  const handleClearAllCalls = async () => {
    if (!confirm('Are you sure you want to clear your entire call history?')) return;
    setCalls([]);
    try {
      await clearAllPhoneCalls();
    } catch {}
  };

  // Send SMS Handler (Google Messages Style)
  const handleSendSms = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rawTarget = activeThreadNumber || newChatRecipient.trim();
    if (!rawTarget || !messageBody.trim()) return;

    let target = rawTarget.replace(/[\s\-\(\)]/g, '');
    if (target.startsWith('0') && target.length === 11) {
      target = '+234' + target.slice(1);
    } else if (target.length === 10 && !target.startsWith('+')) {
      target = '+1' + target;
    } else if (!target.startsWith('+')) {
      target = '+' + target;
    }

    if (!activeNumber && !isAdmin) {
      setActiveTab('buy');
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      const res = await sendSmsMessage({
        from: selectedFromNumber || activeNumber?.phoneNumber || '',
        to: target,
        body: messageBody.trim()
      });

      if (res.success) {
        setMessageBody('');
        setShowEmojiPicker(false);
        if (res.sms) {
          setMessages(prev => [res.sms!, ...prev]);
        }
        if (!activeThreadNumber) {
          setActiveThreadNumber(target);
          setIsComposingNewChat(false);
        }
      } else {
        setSendResult({
          success: false,
          message: res.error || 'Failed to send SMS'
        });
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        message: err.message || 'Error occurred while sending SMS'
      });
    } finally {
      setIsSending(false);
    }
  };

  // Delete Single SMS
  const handleDeleteMessage = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMessages(prev => prev.filter(m => m.id !== id));
    try {
      await deleteSms(id);
    } catch {}
  };

  // Clear All SMS
  const handleClearAllMessages = async () => {
    if (!confirm('Are you sure you want to clear all SMS messages?')) return;
    setMessages([]);
    setActiveThreadNumber(null);
    try {
      await clearAllSms();
    } catch {}
  };

  // Save Contact
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;

    setIsSavingContact(true);
    try {
      const saved = await savePhoneContact({
        name: newContactName.trim(),
        phoneNumber: newContactPhone.trim(),
        notes: newContactNotes.trim() || undefined
      });
      setContacts(prev => [saved, ...prev]);
      setShowAddContactModal(false);
      setNewContactName('');
      setNewContactPhone('');
      setNewContactNotes('');
    } catch (err: any) {
      alert(err.message || 'Failed to save contact');
    } finally {
      setIsSavingContact(false);
    }
  };

  // Delete Contact
  const handleDeleteContact = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContacts(prev => prev.filter(c => c.id !== id));
    try {
      await deletePhoneContact(id);
    } catch {}
  };

  // Open Checkout Modal
  const handleOpenCheckout = (num: AvailablePhoneNumber) => {
    setSelectedNumberToBuy(num);
    setInvoiceUrl(null);
    setInvoiceOrderId(null);
    setCheckoutNotice(null);
    setCheckoutModalOpen(true);
  };

  // Initiate NOWPayments Invoice ($6.00 minimum required by NOWPayments)
  const handleProceedWithNowPayments = async () => {
    if (!selectedNumberToBuy) return;
    setIsGeneratingInvoice(true);
    setCheckoutNotice(null);

    try {
      const res = await createPhoneBuyIntent(selectedNumberToBuy.phoneNumber);
      if (res.invoiceUrl) {
        setInvoiceUrl(res.invoiceUrl);
        setInvoiceOrderId(res.orderId || null);
      } else {
        throw new Error(res.error || 'Could not generate invoice');
      }
    } catch (err: any) {
      setCheckoutNotice(err.message || 'Payment intent error. Please try again.');
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  // Admin Free Number Provisioning (miracle@goldmailer.xyz bypasses payment, old numbers remain active)
  const handleAdminGetNewNumber = async (numToProvision?: string) => {
    setIsAdminProvisioning(true);
    setAdminProvisionNotice(null);
    try {
      const res = await provisionAdminNumber({
        phoneNumber: numToProvision || (availableNumbers[0]?.phoneNumber)
      });
      if (res.success) {
        setAdminProvisionNotice({
          type: 'success',
          message: res.message || 'New number provisioned from SignalWire. Existing lines remain active!'
        });
        await loadPhoneData();
      } else {
        setAdminProvisionNotice({
          type: 'error',
          message: res.error || 'Failed to provision number from SignalWire'
        });
      }
    } catch (err: any) {
      setAdminProvisionNotice({
        type: 'error',
        message: err.message || 'Network error provisioning number'
      });
    } finally {
      setIsAdminProvisioning(false);
    }
  };

  // Open Re-subscribe / Recharge Modal
  const handleOpenRechargeModal = (presetAmount: number = 6) => {
    setRechargeAmount(presetAmount);
    setCustomRechargeAmount(String(presetAmount));
    setRechargeInvoiceUrl(null);
    setRechargeNotice(null);
    setRechargeDetails(null);
    setRechargeModalOpen(true);
  };

  // Initiate Recharge NOWPayments Invoice ($6 - $100 with 1.5% network fee)
  const handleProceedWithRecharge = async () => {
    const num = Number(customRechargeAmount) || rechargeAmount;
    if (isNaN(num) || num < 6 || num > 100) {
      setRechargeNotice('Please choose a recharge amount between $6.00 and $100.00.');
      return;
    }

    setIsGeneratingRechargeInvoice(true);
    setRechargeNotice(null);

    try {
      const res = await rechargeWallet({
        amount: num,
        phoneNumber: activeNumber?.phoneNumber
      });
      if (res.success && res.invoiceUrl) {
        setRechargeInvoiceUrl(res.invoiceUrl);
        setRechargeDetails(res);
      } else {
        setRechargeNotice(res.error || 'Failed to create recharge invoice.');
      }
    } catch (err: any) {
      setRechargeNotice(err.message || 'Error creating crypto invoice. Please try again.');
    } finally {
      setIsGeneratingRechargeInvoice(false);
    }
  };

  // Helper: Extract OTP Code from SMS body
  const extractCode = (body: string) => {
    const match = body.match(/\b\d{4,8}\b/);
    return match ? match[0] : null;
  };

  // Filter contacts by search query
  const filteredContacts = contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phoneNumber.includes(q);
  });

  return (
    <div className={`flex-1 flex flex-col min-h-0 relative select-none ${
      darkMode ? 'bg-[#101114] text-white' : 'bg-[#faf8f6] text-zinc-900'
    }`}>
      {/* Top Header Banner: Active Phone Number, Coins, Validity & Controls */}
      <div className={`px-4 sm:px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-4 ${
        darkMode ? 'bg-[#15161a] border-white/10' : 'bg-white border-zinc-200'
      }`}>
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center text-white shadow-md shadow-[#FF6A00]/25 flex-shrink-0">
            <Smartphone className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            {activeNumber ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm sm:text-base font-bold tracking-tight">
                    {activeNumber.friendlyName || activeNumber.phoneNumber}
                  </span>
                  {isAdmin ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-xs">
                      Admin Line · Unlimited Free
                    </span>
                  ) : (
                    activeNumber.status === 'suspended' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        Suspended (Recharge to Reactivate)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active
                      </span>
                    )
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span>Number: <strong className="text-white font-mono">{activeNumber.phoneNumber}</strong></span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-emerald-400 font-medium">SMS & Voice</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeNumber.phoneNumber)}
                    className="hover:text-white transition-colors cursor-pointer text-[11px] underline ml-1"
                  >
                    {copiedText === activeNumber.phoneNumber ? 'Copied!' : 'Copy'}
                  </button>
                </p>
              </>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-300">
                    No Active Phone Line
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Inactive
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Get a dedicated line ($6.00 = 300 coins + 30 days) to send & receive texts and calls.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Center / Right: Real-time Validity Badge & Balance & Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Validity Badge: "Valid until: Oct 30, 2026 (12 days left)" */}
          {activeNumber && (
            <div className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 ${
              isAdmin
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : activeNumber.status === 'suspended'
                ? 'bg-red-500/10 border-red-500/20 text-red-300'
                : 'bg-white/5 border-white/10 text-zinc-300'
            }`}>
              <Clock className="w-3.5 h-3.5 text-[#FF8C42]" />
              <span className="font-medium">
                {isAdmin ? (
                  'Lifetime Unlimited'
                ) : (
                  <>
                    Valid until:{' '}
                    <strong className="text-white">
                      {new Date(activeNumber.expiresAt || walletData?.expiresAt || Date.now() + 30 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </strong>{' '}
                    <span className="text-zinc-400">({activeNumber.daysRemaining ?? walletData?.daysRemaining ?? 30} days left)</span>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Balance Badge: "Balance: 45 / 300 coins" */}
          <div className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-[#FF6A00]/15 border border-[#FF6A00]/30 text-xs flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold text-zinc-300">Balance:</span>
            <span className="font-bold font-mono text-amber-400">
              {isAdmin ? '∞ / Unlimited' : `${walletData?.coins ?? (activeNumber ? 300 : 0)} / 300 coins`}
            </span>
          </div>

          {/* Re-subscribe Now Button (ALWAYS VISIBLE) */}
          <button
            type="button"
            onClick={() => handleOpenRechargeModal(6)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow-md shadow-[#FF6A00]/25 hover:shadow-[#FF6A00]/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            title="Re-subscribe / Recharge with NOWPayments Crypto"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Re-subscribe Now</span>
          </button>

          {/* Admin "Get New Number" from SignalWire (Free) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleAdminGetNewNumber()}
              disabled={isAdminProvisioning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
              title="Provision a new number directly from SignalWire without charging"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAdminProvisioning ? 'Provisioning...' : 'Get New Number'}</span>
            </button>
          )}

          {!activeNumber && !isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('buy')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Buy Number ($6.00)</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              darkMode ? 'bg-white/5 border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-700'
            }`}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#FF6A00]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className={`px-4 sm:px-6 flex items-center gap-2 border-b overflow-x-auto ${
        darkMode ? 'bg-[#131417] border-white/10' : 'bg-zinc-50 border-zinc-200'
      }`}>
        {[
          { id: 'inbox', label: 'Inbox', icon: MessageSquare, count: messages.length },
          { id: 'contacts', label: 'Contacts', icon: Users, count: contacts.length },
          { id: 'calls', label: "Call's", icon: PhoneCallIcon },
          { id: 'history', label: 'History', icon: Clock, count: calls.length },
          { id: 'wallet', label: 'Wallet & Coins', icon: Wallet },
          ...(!isAdmin ? [{ id: 'esim', label: 'eSIM Card', icon: QrCode }] : []),
          { id: 'buy', label: 'Buy Phone Number', icon: Coins }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id !== 'inbox') {
                  setActiveThreadNumber(null);
                  setIsComposingNewChat(false);
                }
              }}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'border-[#FF6A00] text-[#FF6A00] font-bold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-[#FF6A00] text-white' : 'bg-white/10 text-zinc-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-0 sm:p-4 flex flex-col min-h-0">
        {/* ================= TAB 1: GOOGLE MESSAGES FEATURE (PICTURE MATCH) ================= */}
        {activeTab === 'inbox' && (
          <div className="flex-1 flex flex-col min-h-0 max-w-4xl mx-auto w-full">
            {/* Thread Active View (Screenshot Match) */}
            {activeThreadNumber || isComposingNewChat ? (
              <div className={`flex-1 flex flex-col min-h-[580px] rounded-none sm:rounded-3xl border border-white/10 overflow-hidden shadow-2xl ${
                darkMode ? 'bg-[#0f1013]' : 'bg-[#18191d] text-white'
              }`}>
                {/* Top Header matching Picture (← , [G], Name, 📞, 👤+, ⋮) */}
                <div className="px-4 py-3 bg-[#16171b] border-b border-white/10 flex items-center justify-between gap-3 flex-shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveThreadNumber(null);
                        setIsComposingNewChat(false);
                      }}
                      className="p-1.5 text-zinc-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                      title="Back to conversation list"
                    >
                      <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
                    </button>

                    {/* Circular Initial Avatar (Orange with G / Initial) matching picture */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] text-white font-bold text-base flex items-center justify-center shadow-md flex-shrink-0">
                      {currentThread?.initial || 'G'}
                    </div>

                    <div className="min-w-0">
                      {isComposingNewChat && !activeThreadNumber ? (
                        <div className="relative">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 font-semibold">To:</span>
                            <input
                              type="tel"
                              placeholder="+1 (555) 123-4567 or contact name"
                              value={newChatRecipient}
                              onChange={(e) => setNewChatRecipient(e.target.value)}
                              className="bg-transparent text-sm font-bold text-white outline-none placeholder-zinc-500 font-mono w-48 sm:w-72"
                              autoFocus
                            />
                          </div>
                          {/* Matching Contacts Autocomplete Dropdown */}
                          {newChatRecipient && contacts.filter(c => 
                            c.name.toLowerCase().includes(newChatRecipient.toLowerCase()) || 
                            c.phoneNumber.includes(newChatRecipient)
                          ).length > 0 && (
                            <div className="absolute left-0 top-8 w-72 bg-[#1f2026] border border-white/10 rounded-xl shadow-2xl py-1 z-40 max-h-48 overflow-y-auto">
                              {contacts
                                .filter(c => 
                                  c.name.toLowerCase().includes(newChatRecipient.toLowerCase()) || 
                                  c.phoneNumber.includes(newChatRecipient)
                                )
                                .map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setActiveThreadNumber(c.phoneNumber);
                                      setIsComposingNewChat(false);
                                      setNewChatRecipient('');
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between text-xs cursor-pointer"
                                  >
                                    <span className="font-bold text-white truncate">{c.name}</span>
                                    <span className="font-mono text-zinc-400 text-[11px]">{c.phoneNumber}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <h3 className="text-sm font-bold text-white truncate leading-tight">
                            {currentThread?.name || activeThreadNumber}
                          </h3>
                          <p className="text-[11px] text-zinc-400 font-mono truncate">
                            {activeThreadNumber}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Header Actions: 📞, 👤+, ⋮ */}
                  <div className="flex items-center gap-1 flex-shrink-0 relative">
                    <button
                      type="button"
                      onClick={() => handleMakeCall(undefined, activeThreadNumber || newChatRecipient)}
                      className="p-2 text-zinc-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                      title="Voice Call"
                    >
                      <Phone className="w-5 h-5 stroke-[2]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewContactPhone(activeThreadNumber || newChatRecipient);
                        setShowAddContactModal(true);
                      }}
                      className="p-2 text-zinc-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                      title="Add to contacts"
                    >
                      <UserPlus className="w-5 h-5 stroke-[2]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowThreadMenu(!showThreadMenu)}
                      className="p-2 text-zinc-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                      title="More options"
                    >
                      <MoreVertical className="w-5 h-5 stroke-[2]" />
                    </button>

                    {showThreadMenu && (
                      <div className="absolute right-0 top-12 w-48 bg-[#1f2026] border border-white/10 rounded-2xl shadow-2xl py-1 z-30 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeThreadNumber) handleCopy(activeThreadNumber);
                            setShowThreadMenu(false);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-white/10 flex items-center gap-2 text-zinc-200"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy phone number</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Delete all messages in this thread?')) {
                              currentThread?.messages.forEach(m => deleteSms(m.id));
                              setMessages(prev => prev.filter(m => (m.direction === 'outbound' ? m.to : m.from) !== activeThreadNumber));
                              setActiveThreadNumber(null);
                            }
                            setShowThreadMenu(false);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 flex items-center gap-2 text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete conversation</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Center Chat Message Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#0d0e12]">
                  {currentThread?.messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#FF6A00]/20 to-amber-500/20 text-[#FF6A00] flex items-center justify-center mb-3">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-semibold text-zinc-300">Start of conversation</p>
                      <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                        Messages sent with {activeNumber?.phoneNumber || 'carrier line'} to {activeThreadNumber || newChatRecipient} will display here.
                      </p>
                    </div>
                  ) : (
                    currentThread?.messages.map((msg) => {
                      const isOutbound = msg.direction === 'outbound';
                      const code = extractCode(msg.body);
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} group`}
                        >
                          <div className={`max-w-[85%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl relative shadow-md transition-all ${
                            isOutbound
                              ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white rounded-br-xs'
                              : 'bg-[#22232a] text-zinc-100 rounded-bl-xs border border-white/5'
                          }`}>
                            <p className="text-xs break-words leading-relaxed">{msg.body}</p>

                            {/* 1-Click Code Detection */}
                            {code && (
                              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-black/30 text-amber-300">
                                  {code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(code)}
                                  className="text-[11px] font-semibold text-white hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedText === code ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedText === code ? 'Copied' : 'Copy code'}</span>
                                </button>
                              </div>
                            )}

                            {/* Timestamp & Delete hover */}
                            <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] opacity-70">
                              <span>
                                {new Date(msg.receivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteMessage(msg.id, e)}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-300 p-0.5 transition-opacity"
                                title="Delete message"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Send Result / Diagnostic Feedback */}
                {sendResult && !sendResult.success && (
                  <div className="px-4 py-2 bg-red-500/15 border-t border-red-500/20 text-red-400 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{sendResult.message}</span>
                    </div>
                    <button type="button" onClick={() => setSendResult(null)} className="text-red-300 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Quick Smart Replies (Google Messages Feature) */}
                <div className="px-3 py-1.5 bg-[#141519] border-t border-white/5 flex items-center gap-1.5 overflow-x-auto select-none">
                  {['👍 Sounds good!', '⏰ Call you back shortly', '✅ Received, thank you', '📍 On my way', '👋 Hi!'].map((quickText) => (
                    <button
                      key={quickText}
                      type="button"
                      onClick={() => setMessageBody(prev => (prev ? `${prev} ${quickText}` : quickText))}
                      className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[11px] text-zinc-300 border border-white/5 whitespace-nowrap transition-colors cursor-pointer flex-shrink-0"
                    >
                      {quickText}
                    </button>
                  ))}
                </div>

                {/* Carrier Line Info & Segment Counter */}
                <div className="px-4 py-1 bg-[#121317] border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="font-mono">
                      Carrier Line: {selectedFromNumber || activeNumber?.phoneNumber || (isAdmin ? '+1 (205) 607-6793' : 'Direct SignalWire Line')}
                    </span>
                  </div>
                  <div className="font-mono">
                    {messageBody.length}/160 {messageBody.length > 160 ? `(${Math.ceil(messageBody.length / 160)} SMS)` : '(1 SMS)'}
                  </div>
                </div>

                {/* Quick Emoji Reaction Pill (when toggled) */}
                {showEmojiPicker && (
                  <div className="px-4 py-2 bg-[#17181d] border-t border-white/10 flex items-center gap-3 overflow-x-auto">
                    {['👍', '❤️', '😂', '🔥', '🎉', '👋', '🙏', '💯', '✨', '🚀', '✅', '💼'].map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          setMessageBody((prev) => prev + em);
                          setShowEmojiPicker(false);
                        }}
                        className="text-lg hover:scale-125 transition-transform cursor-pointer p-1"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}

                {/* Bottom Input Bar (Pill input + Circular FAB) */}
                <div className="p-3 bg-[#16171b] border-t border-white/10 flex items-center gap-2.5 flex-shrink-0">
                  {/* Rounded Pill Container with input, Smile, Gallery */}
                  <form
                    onSubmit={handleSendSms}
                    className="flex-1 flex items-center bg-[#202127] border border-white/10 rounded-full px-4 py-2 gap-2 shadow-inner focus-within:border-[#FF6A00]/50 transition-colors"
                  >
                    <input
                      type="text"
                      placeholder="Text message (SMS)"
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
                    />

                    {/* Emoji Button */}
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="text-zinc-400 hover:text-white transition-colors cursor-pointer p-1"
                      title="Insert emoji"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {/* Image / Gallery Button */}
                    <button
                      type="button"
                      onClick={() => alert('Attachments can be dispatched over carrier MMS when configured.')}
                      className="text-zinc-400 hover:text-white transition-colors cursor-pointer p-1"
                      title="Attach image (MMS)"
                    >
                      <ImageIcon className="w-5 h-5" />
                    </button>
                  </form>

                  {/* Circular Send FAB */}
                  <button
                    type="button"
                    disabled={isSending || !messageBody.trim() || (!activeNumber && !isAdmin)}
                    onClick={handleSendSms}
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 cursor-pointer flex-shrink-0 ${
                      messageBody.trim() && !isSending
                        ? 'bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] shadow-[#FF6A00]/30 hover:opacity-95'
                        : 'bg-[#2a2b34] text-zinc-500 cursor-not-allowed shadow-none'
                    }`}
                    title={messageBody.trim() ? 'Send SMS' : 'Enter text to send'}
                  >
                    {isSending ? (
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    ) : (
                      <Send className="w-4 h-4 translate-x-0.5" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Threads Overview List */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                      <span>SMS Conversations</span>
                      <span className="text-xs text-zinc-400 font-normal">
                        ({conversationThreads.length} conversation{conversationThreads.length === 1 ? '' : 's'})
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Google Messages styled SMS communication. All threads are deletable.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsComposingNewChat(true);
                        setActiveThreadNumber(null);
                        setNewChatRecipient('');
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow-md hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Start chat</span>
                    </button>

                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllMessages}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>
                </div>

                {conversationThreads.length === 0 ? (
                  <div className={`p-12 text-center rounded-2xl border ${
                    darkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-zinc-200'
                  }`}>
                    <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-tr from-[#FF6A00]/20 to-amber-500/20 text-[#FF6A00] flex items-center justify-center mb-3">
                      <MessageSquare className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-bold">No conversations yet</h3>
                    <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                      Click "Start chat" above to text any phone number, or receive incoming texts on your carrier line.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xs bg-[#16171b]">
                    {conversationThreads.map((thread) => (
                      <div
                        key={thread.number}
                        onClick={() => {
                          setActiveThreadNumber(thread.number);
                          setIsComposingNewChat(false);
                        }}
                        className="p-4 transition-colors flex items-center justify-between gap-3 hover:bg-white/5 cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Circular Orange Avatar (Matching Picture) */}
                          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] text-white font-bold text-base flex items-center justify-center shadow-md flex-shrink-0">
                            {thread.initial}
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate">
                              {thread.name}
                            </h4>
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {thread.lastMessage?.body || 'No messages'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 space-y-1">
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(thread.lastMessage.receivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-[10px] text-[#FF8C42] font-semibold">
                              Open chat →
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: CONTACTS ================= */}
        {activeTab === 'contacts' && (
          <div className="max-w-4xl mx-auto space-y-6 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>Saved Contacts</span>
                  <span className="text-xs text-zinc-400 font-normal">
                    ({contacts.length})
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Save, search, dial, and text your phonebook contacts in 1 click.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddContactModal(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow-md hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Contact</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts by name or phone..."
                className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs border outline-none ${
                  darkMode ? 'bg-white/5 border-white/10 text-white focus:border-[#FF6A00]' : 'bg-white border-zinc-300 text-zinc-900 focus:border-[#FF6A00]'
                }`}
              />
            </div>

            {/* Contacts Grid */}
            {filteredContacts.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${
                darkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-zinc-200'
              }`}>
                <Users className="w-10 h-10 mx-auto text-zinc-500 mb-2 stroke-[1.5]" />
                <h3 className="text-sm font-bold">No contacts saved yet</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                  Click "Add Contact" above to save names and numbers for 1-click calling & SMS.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredContacts.map(contact => (
                  <div
                    key={contact.id}
                    className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                      darkMode ? 'bg-[#18191d] border-white/10 hover:border-white/20' : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate text-white">{contact.name}</p>
                        <p className="text-[11px] font-mono text-zinc-400">{contact.phoneNumber}</p>
                        {contact.notes && (
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">{contact.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveThreadNumber(contact.phoneNumber);
                          setActiveTab('inbox');
                        }}
                        title="Open Chat in Google Messages"
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#FF8C42] transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMakeCall(undefined, contact.phoneNumber)}
                        title="Voice Call"
                        className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors cursor-pointer"
                      >
                        <PhoneCallIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteContact(contact.id, e)}
                        title="Delete contact"
                        className="p-2 rounded-xl hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: CALL'S (DIALER) ================= */}
        {activeTab === 'calls' && (
          <div className="max-w-xl mx-auto space-y-6 w-full">
            <div className={`p-6 rounded-2xl border ${
              darkMode ? 'bg-[#18191e] border-white/10' : 'bg-white border-zinc-200 shadow-sm'
            }`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <PhoneCallIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Voice Call Dialer</h2>
                  <p className="text-xs text-zinc-400">
                    Place direct outbound phone calls through your carrier number.
                  </p>
                </div>
              </div>

              {callResult && (
                <div className={`mb-4 p-3 rounded-xl text-xs flex items-start gap-2 ${
                  callResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {callResult.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <p className="font-semibold">{callResult.message}</p>
                </div>
              )}

              <form onSubmit={handleMakeCall} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    Caller Line (From)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={activeNumber?.phoneNumber || (isAdmin ? '+1 (205) 607-6793 (Admin)' : 'No active phone number')}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border outline-none opacity-80 ${
                      darkMode ? 'bg-white/5 border-white/10 text-zinc-300' : 'bg-zinc-100 border-zinc-300 text-zinc-600'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    Phone Number to Call (To)
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={callRecipient}
                    onChange={(e) => setCallRecipient(e.target.value)}
                    required
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border outline-none ${
                      darkMode ? 'bg-white/5 border-white/10 text-white focus:border-emerald-500' : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-emerald-500'
                    }`}
                  />
                </div>

                {/* Number Keypad */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(digit => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => setCallRecipient(prev => prev + digit)}
                      className={`py-3 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                        darkMode ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-800'
                      }`}
                    >
                      {digit}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isCalling || (!activeNumber && !isAdmin)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <PhoneCallIcon className="w-4 h-4" />
                  <span>{isCalling ? 'Connecting Voice Call...' : 'Place Call'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================= TAB 4: HISTORY ================= */}
        {activeTab === 'history' && (
          <div className="max-w-4xl mx-auto space-y-6 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>Call History</span>
                  <span className="text-xs text-zinc-400 font-normal">
                    ({calls.length} record{calls.length === 1 ? '' : 's'})
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Real records of inbound and outbound calls. All history is deletable.
                </p>
              </div>

              {calls.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllCalls}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {calls.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${
                darkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-zinc-200'
              }`}>
                <PhoneIncoming className="w-10 h-10 mx-auto text-zinc-500 mb-2 stroke-[1.5]" />
                <h3 className="text-sm font-bold">No call history recorded</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                  Inbound and outbound calls placed with your carrier line will display here in real-time.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5 border rounded-2xl overflow-hidden shadow-xs">
                {calls.map((call) => {
                  const isInbound = call.direction === 'inbound';
                  return (
                    <div
                      key={call.id}
                      className={`p-4 transition-colors flex items-center justify-between gap-4 ${
                        darkMode ? 'bg-white/[0.02] hover:bg-white/[0.04]' : 'bg-white hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isInbound ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#FF6A00]/15 text-[#FF6A00]'
                        }`}>
                          {isInbound ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">
                              {isInbound ? `From: ${call.from}` : `To: ${call.to}`}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                              call.status === 'completed'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-amber-500/15 text-amber-400'
                            }`}>
                              {call.status}
                            </span>
                            {call.durationSeconds !== undefined && call.durationSeconds > 0 && (
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {call.durationSeconds}s
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {new Date(call.startedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteCall(call.id, e)}
                        className="text-zinc-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
                        title="Delete call record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: BUY PHONE NUMBER (NOWPAYMENTS $6) ================= */}
        {activeTab === 'buy' && (
          <div className="max-w-4xl mx-auto space-y-6 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>Available Phone Numbers</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">
                    SignalWire Carrier
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Real US numbers for verification, SMS & voice. No free numbers provided until purchased ($6.00).
                </p>
              </div>

              {activeNumber && (
                <button
                  type="button"
                  onClick={() => handleOpenRechargeModal(6)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Renew Active Number</span>
                </button>
              )}
            </div>

            {isAdmin && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-300">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <span className="font-bold">Admin Account (miracle@goldmailer.xyz):</span>
                      <p className="text-[11px] text-zinc-300 mt-0.5">
                        Free direct provisioning from SignalWire without charging. Existing numbers remain active for clients with no disruption.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdminGetNewNumber()}
                    disabled={isAdminProvisioning}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAdminProvisioning ? 'Provisioning...' : 'Get New Number'}</span>
                  </button>
                </div>

                {adminProvisionNotice && (
                  <div className={`p-3 rounded-xl border text-xs font-medium ${
                    adminProvisionNotice.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}>
                    {adminProvisionNotice.message}
                  </div>
                )}
              </div>
            )}

            {/* Real Carrier Numbers Grid */}
            {availableNumbers.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${
                darkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-zinc-200'
              }`}>
                <Coins className="w-10 h-10 mx-auto text-amber-400 mb-2 stroke-[1.5]" />
                <h3 className="text-sm font-bold">Querying SignalWire Inventory</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                  Available numbers are queried live from SignalWire API. If no numbers appear, configure your SignalWire account credentials in the environment.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableNumbers.map((num, idx) => (
                  <div
                    key={idx}
                    className={`p-5 rounded-2xl border flex flex-col justify-between gap-4 ${
                      darkMode ? 'bg-[#18191d] border-white/10 hover:border-white/20' : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-xs'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold font-mono text-white">
                          {num.friendlyName || num.phoneNumber}
                        </span>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400">
                          {isAdmin ? 'Free (Admin)' : '$6.00'}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-400">
                        Carrier: SignalWire US · SMS & Voice Enabled
                      </p>

                      <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" /> Inbound SMS
                        </span>
                        <span className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" /> Outbound SMS
                        </span>
                        <span className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" /> Voice Calls
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleAdminGetNewNumber(num.phoneNumber)}
                          disabled={isAdminProvisioning}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-95 cursor-pointer shadow-sm disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isAdminProvisioning ? 'Activating...' : 'Activate for Admin (Free)'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenCheckout(num)}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-95 cursor-pointer shadow-sm"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>Buy with NOWPayments ($6.00)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 6: WALLET & COINS (MANUAL RENEWAL) ================= */}
        {activeTab === 'wallet' && (
          <div className="max-w-4xl mx-auto space-y-6 w-full">
            {/* Header & Balance Overview */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-amber-400" />
                  <span>Wallet & Coin Balance</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">
                    Shared Wallet
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  {isAdmin
                    ? 'Admin account (miracle@goldmailer.xyz) has unlimited free coins and lifetime validity.'
                    : 'Manual renewal via NOWPayments crypto. All your phone numbers draw daily rent from this single shared wallet.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleOpenRechargeModal(6)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-95 text-white shadow-md shadow-[#FF6A00]/25 flex items-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>Re-subscribe Now ($6.00)</span>
              </button>
            </div>

            {/* Quick Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Card 1: Balance */}
              <div className={`p-4 rounded-2xl border ${
                darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
                  <span className="font-medium">Coin Balance</span>
                  <Coins className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-black font-mono text-amber-400">
                  {isAdmin ? '∞ / Unlimited' : `${walletData?.coins ?? (activeNumber ? 300 : 0)} / 300`}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {isAdmin ? 'Free lifetime master admin' : 'Available coins for rent, SMS & calls'}
                </p>
              </div>

              {/* Card 2: Validity */}
              <div className={`p-4 rounded-2xl border ${
                darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
                  <span className="font-medium">Validity Period</span>
                  <Clock className="w-4 h-4 text-[#FF8C42]" />
                </div>
                <div className="text-sm font-bold text-white">
                  {isAdmin ? (
                    'Lifetime Active'
                  ) : (
                    <>
                      {new Date(activeNumber?.expiresAt || walletData?.expiresAt || Date.now() + 30 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {isAdmin ? 'Never expires' : `${activeNumber?.daysRemaining ?? walletData?.daysRemaining ?? 30} days remaining`}
                </p>
              </div>

              {/* Card 3: Connected Numbers */}
              <div className={`p-4 rounded-2xl border ${
                darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
                  <span className="font-medium">Connected Numbers</span>
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black font-mono text-white">
                  {walletData?.numbersCount ?? phoneNumbers.length}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {walletData?.numbersCount ?? phoneNumbers.length} line(s) drawing 3.3 coins/day rent
                </p>
              </div>
            </div>

            {/* Re-subscribe & Manual Recharge Banner */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[#FF6A00]/10 to-orange-500/10 border border-[#FF6A00]/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#FF6A00]" />
                    <h3 className="text-sm font-bold text-white">Manual Renewal via Crypto (NOWPayments)</h3>
                  </div>
                  <p className="text-xs text-zinc-300">
                    Important: No auto-renewal. Minimum $6 = 300 coins + 30 days. You can pay anytime before expiry to top up.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {[6, 10, 20, 50].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleOpenRechargeModal(amt)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10 cursor-pointer transition-all"
                    >
                      ${amt} ({amt * 50} coins)
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-xs">
                <div>
                  <span className="text-zinc-400 block text-[11px]">Recharge Rate</span>
                  <strong className="text-white">$1 = 50 coins</strong>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Validity Extension</span>
                  <strong className="text-white">1 day = $0.20</strong>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Min / Max Recharge</span>
                  <strong className="text-white">$6.00 / $100.00</strong>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Network Fee</span>
                  <strong className="text-white">1.5% added at checkout</strong>
                </div>
              </div>
            </div>

            {/* Coin Usage Rates Card */}
            <div className={`p-5 rounded-2xl border ${
              darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
            }`}>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <span>Coin Usage Schedule</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[11px] text-zinc-400 block">Daily Rent (Cron)</span>
                  <div className="text-base font-bold font-mono text-amber-400 mt-1">3.3 coins</div>
                  <span className="text-[10px] text-zinc-500">Per day per number</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[11px] text-zinc-400 block">Incoming SMS</span>
                  <div className="text-base font-bold font-mono text-emerald-400 mt-1">2.5 coins</div>
                  <span className="text-[10px] text-zinc-500">Per inbound text</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[11px] text-zinc-400 block">Outgoing SMS</span>
                  <div className="text-base font-bold font-mono text-[#FF8C42] mt-1">5.0 coins</div>
                  <span className="text-[10px] text-zinc-500">Per sent message</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[11px] text-zinc-400 block">Incoming Call</span>
                  <div className="text-base font-bold font-mono text-sky-400 mt-1">5.0 coins/min</div>
                  <span className="text-[10px] text-zinc-500">Per call minute</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[11px] text-zinc-400 block">Outgoing Call</span>
                  <div className="text-base font-bold font-mono text-purple-400 mt-1">5.0 coins/min</div>
                  <span className="text-[10px] text-zinc-500">Per call minute</span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 mt-3">
                * Suspension Rule: When coins reach 0 OR your 30-day validity expires, the number suspends. Re-subscribe anytime with $6 or more to resume active service immediately.
              </p>
            </div>

            {/* Transaction History */}
            <div className={`p-5 rounded-2xl border ${
              darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-zinc-400" />
                  <span>Wallet Transaction History</span>
                </h3>
                <span className="text-xs text-zinc-400">
                  {walletData?.transactions?.length ?? 0} transaction(s)
                </span>
              </div>

              {(!walletData?.transactions || walletData.transactions.length === 0) ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No transactions yet. Recharge your wallet or purchase a number to see activity.
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {walletData.transactions.map((tx) => (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          tx.type === 'credit'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {tx.type === 'credit' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{tx.reason}</p>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                            <span>{new Date(tx.createdAt).toLocaleString()}</span>
                            {tx.phoneNumber && (
                              <span className="font-mono text-zinc-300">· {tx.phoneNumber}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className={`font-mono font-bold text-sm ${
                        tx.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {tx.type === 'credit' ? '+' : '-'}{tx.amount} coins
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 7: E-SIM CARD LOGIC (USERS ONLY, NOT ADMIN) ================= */}
        {activeTab === 'esim' && (
          <div className="max-w-4xl mx-auto space-y-6 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#FF6A00]" />
                  <span>Virtual eSIM Profile</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                    User Only Feature
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Instant digital eSIM activation for your smartphone. Scan QR code or enter manual activation codes.
                </p>
              </div>

              {activeNumber && (
                <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                  activeNumber.status === 'suspended'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${activeNumber.status === 'suspended' ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
                  <span>eSIM Status: {activeNumber.status === 'suspended' ? 'Suspended' : 'Active & Connected'}</span>
                </div>
              )}
            </div>

            {isAdmin ? (
              <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                  <span>Master Administrator Line</span>
                </div>
                <p className="text-zinc-300">
                  The eSIM card feature applies strictly to client user accounts. As administrator (<code className="font-mono text-amber-300">miracle@goldmailer.xyz</code>), your primary line (<code className="font-mono text-amber-300">+1 205 607-6793</code>) routes directly through SignalWire master carrier with unlimited free coins and calls.
                </p>
              </div>
            ) : !activeNumber ? (
              <div className={`p-10 text-center rounded-2xl border ${
                darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
              }`}>
                <Smartphone className="w-12 h-12 mx-auto text-zinc-500 mb-3" />
                <h3 className="text-base font-bold text-white">No Active Phone Line</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                  You need an active phone number to generate an eSIM profile. Purchase a dedicated line for $6.00 to activate your virtual eSIM immediately.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('buy')}
                  className="mt-4 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white hover:opacity-95 shadow-md cursor-pointer"
                >
                  Buy Number ($6.00)
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Holographic Digital eSIM Card & QR Code */}
                <div className="lg:col-span-6 space-y-4">
                  {/* Digital SIM Graphic */}
                  <div className="relative p-6 rounded-3xl bg-gradient-to-br from-zinc-900 via-[#181a20] to-[#221710] border border-white/15 shadow-2xl overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF6A00]/10 rounded-full blur-3xl -z-0" />

                    <div className="relative z-10 space-y-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-[#FF6A00] flex items-center justify-center text-white font-black text-xs shadow-md">
                            GM
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white tracking-wide">GoldMobile eSIM</h4>
                            <span className="text-[10px] text-zinc-400 font-mono">Carrier: SignalWire US</span>
                          </div>
                        </div>

                        {/* Holographic Chip Graphic */}
                        <div className="w-10 h-8 rounded-lg bg-gradient-to-tr from-amber-200 via-amber-400 to-yellow-600 border border-amber-300/60 shadow-inner flex flex-col justify-around p-1 opacity-90">
                          <div className="w-full h-0.5 bg-amber-800/40 rounded-full" />
                          <div className="w-full h-0.5 bg-amber-800/40 rounded-full" />
                          <div className="w-full h-0.5 bg-amber-800/40 rounded-full" />
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Assigned Phone Number</span>
                        <div className="text-xl font-bold font-mono text-white tracking-wider mt-0.5">
                          {esimProfile?.phoneNumber || activeNumber.phoneNumber}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 text-xs">
                        <div>
                          <span className="text-[10px] text-zinc-400 uppercase block">ICCID</span>
                          <span className="font-mono text-zinc-200 text-[11px] truncate block">
                            {esimProfile?.iccid || '8901410320000000000'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 uppercase block">Profile Status</span>
                          <span className={`text-[11px] font-bold ${activeNumber.status === 'suspended' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {activeNumber.status === 'suspended' ? 'Suspended (Recharge)' : 'Ready for Install'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* QR Code Card */}
                  <div className={`p-6 rounded-2xl border text-center ${
                    darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
                  }`}>
                    <h4 className="text-sm font-bold text-white mb-2">Scan QR Code to Install</h4>
                    <p className="text-xs text-zinc-400 mb-4">
                      Point your iPhone or Android camera at the code below to add this line directly to your device cellular plans.
                    </p>

                    <div className="inline-block p-4 rounded-2xl bg-white shadow-xl">
                      {esimQrUrl ? (
                        <img src={esimQrUrl} alt="eSIM Activation QR" className="w-48 h-48 mx-auto" />
                      ) : (
                        <div className="w-48 h-48 flex items-center justify-center text-zinc-600">
                          <QrCode className="w-16 h-16 animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-2">
                      {esimQrUrl && (
                        <a
                          href={esimQrUrl}
                          download={`GoldMobile_eSIM_${(activeNumber.phoneNumber).replace(/\D/g, '')}.png`}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Save QR Code Image</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Manual Configuration Details & Step-by-Step Device Guides */}
                <div className="lg:col-span-6 space-y-4">
                  {/* Manual Activation Parameters */}
                  <div className={`p-5 rounded-2xl border space-y-3.5 ${
                    darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
                  }`}>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-[#FF6A00]" />
                      <span>Manual Activation Details</span>
                    </h4>
                    <p className="text-xs text-zinc-400">
                      If you cannot scan the QR code, choose "Enter Details Manually" on your smartphone.
                    </p>

                    {/* SM-DP+ Address */}
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                        <span>SM-DP+ Address:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(esimProfile?.smdpAddress || 'smdp.goldmailer.xyz')}
                          className="text-[#FF6A00] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <div className="font-mono text-xs font-bold text-white">
                        {esimProfile?.smdpAddress || 'smdp.goldmailer.xyz'}
                      </div>
                    </div>

                    {/* Activation Code / Matching ID */}
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                        <span>Activation Code (LPA String):</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(esimProfile?.activationCode || `LPA:1$smdp.goldmailer.xyz$GM-${activeNumber.phoneNumber.replace(/\D/g, '').slice(-6)}`)}
                          className="text-[#FF6A00] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <div className="font-mono text-xs font-bold text-white break-all">
                        {esimProfile?.activationCode || `LPA:1$smdp.goldmailer.xyz$GM-${activeNumber.phoneNumber.replace(/\D/g, '').slice(-6)}`}
                      </div>
                    </div>

                    {/* ICCID */}
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                        <span>SIM ICCID:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(esimProfile?.iccid || `890141032${activeNumber.phoneNumber.replace(/\D/g, '')}`)}
                          className="text-[#FF6A00] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <div className="font-mono text-xs font-bold text-white">
                        {esimProfile?.iccid || `890141032${activeNumber.phoneNumber.replace(/\D/g, '')}`}
                      </div>
                    </div>
                  </div>

                  {/* Device Installation Guides */}
                  <div className={`p-5 rounded-2xl border space-y-4 ${
                    darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
                  }`}>
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <h4 className="text-sm font-bold text-white">Installation Guide</h4>
                      <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setEsimGuideTab('ios')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            esimGuideTab === 'ios'
                              ? 'bg-[#FF6A00] text-white'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Apple iOS
                        </button>
                        <button
                          type="button"
                          onClick={() => setEsimGuideTab('android')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            esimGuideTab === 'android'
                              ? 'bg-[#FF6A00] text-white'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Android
                        </button>
                      </div>
                    </div>

                    {esimGuideTab === 'ios' ? (
                      <ol className="space-y-2.5 text-xs text-zinc-300 list-decimal list-inside">
                        <li>Open <strong className="text-white">Settings</strong> on your iPhone.</li>
                        <li>Tap <strong className="text-white">Cellular</strong> or <strong className="text-white">Mobile Data</strong>.</li>
                        <li>Tap <strong className="text-white">Add eSIM</strong> or <strong className="text-white">Add Cellular Plan</strong>.</li>
                        <li>Select <strong className="text-white">Use QR Code</strong> and scan the code on the left.</li>
                        <li>If asked, enter the confirmation code or label as <strong className="text-white">GoldMailer Line</strong>.</li>
                      </ol>
                    ) : (
                      <ol className="space-y-2.5 text-xs text-zinc-300 list-decimal list-inside">
                        <li>Open <strong className="text-white">Settings</strong> on your Android phone.</li>
                        <li>Tap <strong className="text-white">Network & Internet</strong> → <strong className="text-white">SIMs</strong>.</li>
                        <li>Tap <strong className="text-white">Add SIM</strong> or <strong className="text-white">Download a SIM instead</strong>.</li>
                        <li>Scan the QR code shown on the screen.</li>
                        <li>Confirm and tap <strong className="text-white">Download & Activate</strong>.</li>
                      </ol>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= MODAL: MANUAL RE-SUBSCRIBE & RECHARGE ================= */}
      {rechargeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#18191c] border-2 border-[#FF6A00]/40 text-white rounded-3xl shadow-2xl p-6 sm:p-7">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00]">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Manual Renewal & Recharge</h3>
                  <p className="text-xs text-zinc-400">NOWPayments Cryptocurrency Invoice</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRechargeModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* BIG WARNING NOTE: Select Stable Coin */}
            <div className="mt-4 p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-200 text-xs shadow-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm tracking-wide uppercase">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 animate-bounce" />
                <span>IMPORTANT PAYMENT / SUBSCRIPTION WARNING</span>
              </div>
              <p className="text-white text-xs font-semibold leading-relaxed">
                ⚠️ <strong className="text-amber-300">NOTE:</strong> Please select <strong>any stable coin</strong> (such as <strong>USDT TRC20</strong>, <strong>USDT ERC20</strong>, or <strong>USDC</strong>) to make a payment to, then continue. Stable coins ensure instant confirmation with minimal gas fees!
              </p>
              <p className="text-zinc-300 text-[11px] pt-1.5 border-t border-amber-500/20">
                Because we use NOWPayments crypto, renewals cannot be billed automatically. When coins deplete or your 30 days end, your number suspends. Re-subscribe manually anytime to resume service.
              </p>
            </div>

            {/* Preset Amount Selector */}
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                Choose Recharge Amount (Min $6.00, Max $100.00):
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[6, 10, 20, 50].map((amt) => {
                  const isSelected = Number(customRechargeAmount) === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setRechargeAmount(amt);
                        setCustomRechargeAmount(String(amt));
                        setRechargeInvoiceUrl(null);
                      }}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#FF6A00] text-white border-[#FF6A00] shadow-md shadow-[#FF6A00]/25'
                          : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      ${amt}
                      <span className="block text-[10px] font-normal opacity-80">
                        +{amt * 50} coins
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Input */}
              <div className="pt-2">
                <span className="text-[11px] text-zinc-400 block mb-1">Or enter custom amount ($USD):</span>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 text-xs font-bold">$</span>
                  <input
                    type="number"
                    min="6"
                    max="100"
                    step="1"
                    value={customRechargeAmount}
                    onChange={(e) => {
                      setCustomRechargeAmount(e.target.value);
                      setRechargeInvoiceUrl(null);
                    }}
                    className="w-full pl-7 pr-3 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-white outline-none focus:border-[#FF6A00]"
                    placeholder="e.g. 15"
                  />
                </div>
              </div>
            </div>

            {/* Live Calculation Card */}
            {(() => {
              const val = Number(customRechargeAmount) || 6;
              const coins = Math.round(val * 50);
              const days = Math.round(val / 0.20);
              const netFee = Number((val * 0.015).toFixed(2));
              const total = Number((val + netFee).toFixed(2));

              return (
                <div className="mt-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Recharge Amount:</span>
                    <span className="font-mono font-bold text-white">${val.toFixed(2)} USD</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Network fee (NOWPayments 1.5%):</span>
                    <span className="font-mono font-medium text-zinc-300">+${netFee.toFixed(2)} USD</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Coins Added:</span>
                    <span className="font-mono font-bold text-amber-400">+{coins} coins</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Validity Extended:</span>
                    <span className="font-mono font-bold text-emerald-400">+{days} days</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="font-semibold text-zinc-200">Total at Checkout:</span>
                    <span className="text-base font-bold text-amber-400 font-mono">${total.toFixed(2)} USD</span>
                  </div>
                </div>
              );
            })()}

            {rechargeNotice && (
              <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                {rechargeNotice}
              </div>
            )}

            {/* Generated Invoice State */}
            {rechargeInvoiceUrl ? (
              <div className="mt-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Invoice Ready on NOWPayments</span>
                </div>
                <p className="text-zinc-300">
                  Complete your payment via NOWPayments. Once confirmed on the blockchain, your coins are credited and expiration extended automatically.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={rechargeInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-center flex items-center justify-center gap-1.5 hover:opacity-95 shadow-md"
                  >
                    <span>Open NOWPayments Invoice</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(rechargeInvoiceUrl)}
                    className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium cursor-pointer"
                    title="Copy checkout link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRechargeModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-white/10 hover:bg-white/5 cursor-pointer text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isGeneratingRechargeInvoice}
                  onClick={handleProceedWithRecharge}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white hover:opacity-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6A00]/25 disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>{isGeneratingRechargeInvoice ? 'Creating Invoice...' : 'Generate Crypto Invoice'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD CONTACT ================= */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-[#18191c] border border-white/10 text-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#FF6A00]" />
                <span>Save New Contact</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddContactModal(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Phone Number (E.164)
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-white/5 border border-white/10 text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Work colleague, vendor..."
                  value={newContactNotes}
                  onChange={(e) => setNewContactNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddContactModal(false)}
                  className="flex-1 py-2 rounded-xl text-xs border border-white/10 hover:bg-white/5 cursor-pointer text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingContact}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#FF6A00] text-white hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  {isSavingContact ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: NOWPAYMENTS CHECKOUT ($6.00) ================= */}
      {checkoutModalOpen && selectedNumberToBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#18191c] border-2 border-amber-500/30 text-white rounded-3xl shadow-2xl p-6 sm:p-7">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">NOWPayments Checkout</h3>
                  <p className="text-xs text-zinc-400">Secure Instant Cryptocurrency Gateway</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* BIG WARNING NOTE: Select Stable Coin */}
            <div className="mt-4 p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-200 text-xs shadow-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm tracking-wide uppercase">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 animate-bounce" />
                <span>IMPORTANT PAYMENT / SUBSCRIPTION WARNING</span>
              </div>
              <p className="text-white text-xs font-semibold leading-relaxed">
                ⚠️ <strong className="text-amber-300">NOTE:</strong> Please select <strong>any stable coin</strong> (such as <strong>USDT TRC20</strong>, <strong>USDT ERC20</strong>, or <strong>USDC</strong>) to make a payment to, then continue. Stable coins ensure instant confirmation with minimal gas fees!
              </p>
            </div>

            {/* Order Details Card */}
            <div className="mt-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Dedicated Number:</span>
                <span className="font-mono font-bold text-white text-sm">
                  {selectedNumberToBuy.phoneNumber}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Carrier:</span>
                <span className="font-medium text-emerald-400">SignalWire US Carrier</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Capabilities:</span>
                <span className="font-medium text-zinc-300">2-Way SMS & Voice Calling</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="font-semibold text-zinc-200">Total Price:</span>
                <span className="text-base font-bold text-amber-400 font-mono">
                  $6.00 USD
                </span>
              </div>
            </div>

            {/* Accepted Currencies Pill Row */}
            <div className="mt-4">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                Recommended Stable Coins & Supported Currencies
              </span>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold font-mono text-zinc-300">
                {['USDT (TRC20) ⭐', 'USDT (ERC20) ⭐', 'USDC ⭐', 'BTC', 'ETH', 'SOL', 'LTC', 'DOGE'].map(coin => (
                  <span key={coin} className={`px-2.5 py-1 rounded-lg border ${coin.includes('⭐') ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold' : 'bg-white/5 border-white/10 text-zinc-300'}`}>
                    {coin}
                  </span>
                ))}
              </div>
            </div>

            {checkoutNotice && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                {checkoutNotice}
              </div>
            )}

            {/* Generated Invoice State */}
            {invoiceUrl ? (
              <div className="mt-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Invoice Ready on NOWPayments ($6.00)</span>
                </div>
                <p className="text-zinc-300">
                  Click the button below to complete payment via NOWPayments. Once payment is confirmed on the blockchain, your number activates automatically.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-center flex items-center justify-center gap-1.5 hover:opacity-95 shadow-md"
                  >
                    <span>Proceed to NOWPayments ($6.00)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(invoiceUrl)}
                    className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium cursor-pointer"
                    title="Copy checkout link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCheckoutModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-white/10 hover:bg-white/5 cursor-pointer text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isGeneratingInvoice}
                  onClick={handleProceedWithNowPayments}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white hover:opacity-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>{isGeneratingInvoice ? 'Creating Invoice...' : 'Generate Crypto Invoice ($6)'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
