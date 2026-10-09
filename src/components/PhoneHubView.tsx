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
  Loader2
} from 'lucide-react';
import {
  SMSMessage,
  UserPhoneNumber,
  AvailablePhoneNumber,
  UserProfile,
  PhoneCall,
  PhoneContact
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
  deletePhoneContact
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
  const [activeTab, setActiveTab] = useState<'inbox' | 'contacts' | 'calls' | 'history' | 'buy'>('inbox');
  const [phoneNumbers, setPhoneNumbers] = useState<UserPhoneNumber[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [contacts, setContacts] = useState<PhoneContact[]>([]);

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

  const isAdmin = user?.email === 'miracle@goldmailer.xyz' || user?.role === 'admin';
  const activeNumber = phoneNumbers[0] || null;

  // Load real data exclusively
  const loadPhoneData = async () => {
    setIsLoading(true);
    try {
      const [phonesRes, smsRes, availRes, callsRes, contactsRes] = await Promise.all([
        fetchUserPhoneNumbers(),
        fetchSmsInbox(),
        fetchAvailablePhoneNumbers(),
        fetchPhoneCalls(),
        fetchPhoneContacts()
      ]);

      if (phonesRes.numbers && phonesRes.numbers.length > 0) {
        // Use all numbers authorized and returned by the server for this user/admin
        setPhoneNumbers(phonesRes.numbers);
        setSelectedFromNumber(phonesRes.numbers[0].phoneNumber);
      } else {
        setPhoneNumbers([]);
        setSelectedFromNumber('');
      }

      setMessages(smsRes);
      setCalls(callsRes);
      // Ensure any phone number that has been bought is never displayed in available numbers
      const boughtNumbers = new Set(
        (phonesRes.numbers || []).map(p => p.phoneNumber.replace(/[^\d+]/g, ''))
      );
      if (phonesRes.adminNumber) {
        boughtNumbers.add(phonesRes.adminNumber.replace(/[^\d+]/g, ''));
      }
      const unboughtAvail = (availRes || []).filter(
        a => !boughtNumbers.has(a.phoneNumber.replace(/[^\d+]/g, ''))
      );
      setAvailableNumbers(unboughtAvail);
      setContacts(contactsRes);
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

  // Place Call Handler (Direct Twilio Voice Calling, No TTS)
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
      {/* Top Header Banner: Active Phone Number & Controls */}
      <div className={`px-4 sm:px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-4 ${
        darkMode ? 'bg-[#15161a] border-white/10' : 'bg-white border-zinc-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center text-white shadow-md shadow-[#FF6A00]/25">
            <Smartphone className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            {activeNumber ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm sm:text-base font-bold tracking-tight">
                    {activeNumber.friendlyName || activeNumber.phoneNumber}
                  </span>
                  {isAdmin && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-xs">
                      Free Admin Line
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                  <span>Number: {activeNumber.phoneNumber}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-emerald-400 font-medium">SMS & Voice Enabled</span>
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
                    No Active Phone Number
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Inactive
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Rent a dedicated phone number ($6.00) to send & receive texts and calls.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {!activeNumber && !isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('buy')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Buy Phone Number ($6.00)</span>
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
                      Carrier Line: {selectedFromNumber || activeNumber?.phoneNumber || (isAdmin ? '+1 (737) 250-8034' : 'Direct Twilio Line')}
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
                    value={activeNumber?.phoneNumber || (isAdmin ? '+1 (737) 250-8034 (Admin)' : 'No active phone number')}
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
                    Twilio Carrier
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Real US numbers for verification, SMS & voice. No free numbers provided until purchased ($6.00).
                </p>
              </div>

              {activeNumber && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await extendPhoneSubscription(activeNumber.phoneNumber);
                    if (res.success) {
                      alert(res.message || 'Subscription extended.');
                      await loadPhoneData();
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Renew Active Number</span>
                </button>
              )}
            </div>

            {isAdmin && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs flex items-center justify-between gap-3 text-amber-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                  <span>Admin Account: miracle@goldmailer.xyz has exclusive access to the dedicated admin line.</span>
                </div>
              </div>
            )}

            {/* Real Carrier Numbers Grid */}
            {availableNumbers.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${
                darkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-zinc-200'
              }`}>
                <Coins className="w-10 h-10 mx-auto text-amber-400 mb-2 stroke-[1.5]" />
                <h3 className="text-sm font-bold">Querying Twilio Inventory</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                  Available numbers are queried live from Twilio API. If no numbers appear, configure your Twilio account credentials in the environment.
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
                          $6.00
                        </span>
                      </div>

                      <p className="text-xs text-zinc-400">
                        Carrier: Twilio US · SMS & Voice Enabled
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
                      <button
                        type="button"
                        onClick={() => handleOpenCheckout(num)}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-95 cursor-pointer shadow-sm"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        <span>Buy with NOWPayments ($6.00)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
                <span className="font-medium text-emerald-400">Twilio US Carrier</span>
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
                Supported Cryptocurrencies
              </span>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold font-mono text-zinc-300">
                {['BTC', 'USDT (TRC20)', 'ETH', 'SOL', 'LTC', 'DOGE'].map(coin => (
                  <span key={coin} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
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
