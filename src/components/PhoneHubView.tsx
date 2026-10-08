import React, { useState, useEffect } from 'react';
import {
  Phone,
  MessageSquare,
  Send,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Clock,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Coins,
  Radio,
  FileCode,
  Sparkles,
  ArrowRight,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall as PhoneCallIcon,
  Volume2,
  Mic,
  Play
} from 'lucide-react';
import { SMSMessage, UserPhoneNumber, AvailablePhoneNumber, TwilioLogItem, UserProfile, PhoneCall } from '../types';
import {
  fetchUserPhoneNumbers,
  fetchAvailablePhoneNumbers,
  fetchSmsInbox,
  sendSmsMessage,
  createPhoneBuyIntent,
  activatePhoneNumber,
  extendPhoneSubscription,
  fetchTwilioVerificationLogs,
  simulateInboundSms,
  deleteSms,
  fetchPhoneCalls,
  makePhoneCall,
  deletePhoneCall
} from '../lib/api';

interface PhoneHubViewProps {
  user: UserProfile | null;
  darkMode: boolean;
  onOpenEmail: () => void;
}

export const PhoneHubView: React.FC<PhoneHubViewProps> = ({
  user,
  darkMode,
  onOpenEmail
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'send' | 'calls' | 'buy' | 'logs'>('inbox');
  const [phoneNumbers, setPhoneNumbers] = useState<UserPhoneNumber[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [twilioLogs, setTwilioLogs] = useState<TwilioLogItem[]>([]);
  const [twilioMeta, setTwilioMeta] = useState<{
    isConfigured: boolean;
    trialNumber: string;
    maskedAccountSid: string;
    webhookUrl: string;
  }>({
    isConfigured: false,
    trialNumber: '+17372508034',
    maskedAccountSid: 'Loading...',
    webhookUrl: 'https://goldmailer.xyz/api/webhook/twilio/sms'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Send SMS Form State
  const [recipientNumber, setRecipientNumber] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [selectedFromNumber, setSelectedFromNumber] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // Voice Call State
  const [callRecipient, setCallRecipient] = useState('');
  const [callMessage, setCallMessage] = useState('Hello! This is a secure voice call from GoldMailer.');
  const [isCalling, setIsCalling] = useState(false);
  const [callResult, setCallResult] = useState<{ success: boolean; message: string } | null>(null);

  // Buy Number State
  const [isBuying, setIsBuying] = useState(false);
  const [nowPaymentsInvoiceUrl, setNowPaymentsInvoiceUrl] = useState<string | null>(null);
  const [buySuccessMessage, setBuySuccessMessage] = useState<string | null>(null);

  // Initial Load
  const loadPhoneData = async () => {
    setIsLoading(true);
    try {
      const [phonesRes, smsRes, logsRes, availRes, callsRes] = await Promise.all([
        fetchUserPhoneNumbers(),
        fetchSmsInbox(),
        fetchTwilioVerificationLogs(),
        fetchAvailablePhoneNumbers(),
        fetchPhoneCalls()
      ]);

      if (phonesRes.numbers && phonesRes.numbers.length > 0) {
        setPhoneNumbers(phonesRes.numbers);
        setSelectedFromNumber(phonesRes.numbers[0].phoneNumber);
      } else {
        setSelectedFromNumber('+17372508034');
      }

      setMessages(smsRes);
      setCalls(callsRes);
      setAvailableNumbers(availRes);

      if (logsRes) {
        setTwilioLogs(logsRes.twilioLogs || []);
        setTwilioMeta({
          isConfigured: logsRes.isConfigured,
          trialNumber: logsRes.trialNumber || '+17372508034',
          maskedAccountSid: logsRes.maskedAccountSid,
          webhookUrl: logsRes.webhookUrl
        });
      }
    } catch (err) {
      console.warn('Failed to load phone data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPhoneData();
  }, []);

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

  // Place Voice Call Handler
  const handleMakeCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callRecipient.trim()) return;

    setIsCalling(true);
    setCallResult(null);

    try {
      const res = await makePhoneCall({
        to: callRecipient.trim(),
        from: selectedFromNumber || '+17372508034',
        message: callMessage.trim()
      });

      if (res.success) {
        setCallResult({
          success: true,
          message: `Voice call initiated successfully! Call SID: ${res.callSid || 'in-progress'}`
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

  const handleDeleteCall = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCalls(prev => prev.filter(c => c.id !== id));
    try {
      await deletePhoneCall(id);
    } catch {}
  };

  // Send SMS Handler
  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientNumber.trim() || !messageBody.trim()) return;

    setIsSending(true);
    setSendResult(null);

    try {
      const res = await sendSmsMessage({
        from: selectedFromNumber || '+17372508034',
        to: recipientNumber.trim(),
        body: messageBody.trim()
      });

      if (res.success) {
        setSendResult({
          success: true,
          message: `SMS dispatched successfully! Message SID: ${res.messageSid || 'confirmed'}`
        });
        setMessageBody('');
        if (res.sms) {
          setMessages(prev => [res.sms!, ...prev]);
        }
      } else {
        setSendResult({
          success: false,
          message: res.error || 'Failed to dispatch SMS'
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

  // Buy Intent with NOWPayments
  const handleBuyWithNowPayments = async (num: string) => {
    setIsBuying(true);
    setBuySuccessMessage(null);
    try {
      const res = await createPhoneBuyIntent(num);
      if (res.invoiceUrl) {
        setNowPaymentsInvoiceUrl(res.invoiceUrl);
      }
    } catch (err: any) {
      alert(err.message || 'Payment intent failed');
    } finally {
      setIsBuying(false);
    }
  };

  // Instant Activation / Local Activation
  const handleActivateNumberDirectly = async (num: string, friendlyName: string) => {
    setIsBuying(true);
    try {
      const res = await activatePhoneNumber(num, friendlyName);
      if (res.success) {
        setBuySuccessMessage(`Phone number ${num} is active for 30 days!`);
        await loadPhoneData();
      }
    } catch (err: any) {
      alert(err.message || 'Activation failed');
    } finally {
      setIsBuying(false);
    }
  };

  // Extend 30 days subscription
  const handleExtend30Days = async (phoneNumber?: string) => {
    try {
      const res = await extendPhoneSubscription(phoneNumber);
      if (res.success) {
        alert(res.message || 'Extended 30 days!');
        await loadPhoneData();
      }
    } catch (err: any) {
      alert(err.message || 'Extension failed');
    }
  };

  // Trigger test incoming SMS simulator
  const handleTriggerTestSms = async () => {
    const testCode = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      const res = await simulateInboundSms({
        from: '+15550199321',
        to: activeNumber?.phoneNumber || '+17372508034',
        body: `Your GoldMailer verification OTP is: ${testCode}. Do not share this code with anyone.`
      });
      if (res.sms) {
        setMessages(prev => [res.sms, ...prev]);
        setActiveTab('inbox');
      }
    } catch (err: any) {
      alert(err.message || 'Simulator failed');
    }
  };

  const handleDeleteMessage = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMessages(prev => prev.filter(m => m.id !== id));
    try {
      await deleteSms(id);
    } catch {}
  };

  const activeNumber = phoneNumbers[0] || {
    phoneNumber: '+17372508034',
    friendlyName: '(737) 250-8034',
    daysRemaining: 30,
    status: 'active'
  };

  // Extract 2FA code helper
  const extractCode = (body: string) => {
    const match = body.match(/\b\d{4,8}\b/);
    return match ? match[0] : null;
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 relative select-none ${
      darkMode ? 'bg-[#121214] text-white' : 'bg-[#faf8f6] text-zinc-900'
    }`}>
      {/* Top Header Banner: Active Phone Number & Controls */}
      <div className={`px-4 sm:px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${
        darkMode ? 'bg-[#16171b] border-white/10' : 'bg-white border-zinc-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center text-white shadow-lg shadow-[#FF6A00]/25">
            <Smartphone className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base sm:text-lg font-bold tracking-tight">
                {activeNumber.friendlyName || activeNumber.phoneNumber}
              </span>
              {(user?.email === 'miracle@goldmailer.xyz' || activeNumber.phoneNumber === '+17372508034') && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-xs">
                  Free Admin Line
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active ({activeNumber.daysRemaining || 30}d left)
              </span>
            </div>
            <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
              <span>Twilio Number: {activeNumber.phoneNumber}</span>
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
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-semibold hover:shadow-lg hover:shadow-[#FF6A00]/30 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send SMS</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calls')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              activeTab === 'calls'
                ? 'bg-emerald-500 text-white border-emerald-500'
                : darkMode
                  ? 'bg-white/5 border-white/10 hover:bg-white/10 text-emerald-400'
                  : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-800'
            }`}
          >
            <PhoneCallIcon className="w-3.5 h-3.5" />
            <span>Voice Call</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('buy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              darkMode ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-900'
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Buy / Extend (NOWPayments)</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              darkMode ? 'bg-white/5 border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-700'
            }`}
            title="Refresh Phone Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#FF6A00]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className={`px-4 sm:px-6 flex items-center gap-2 border-b overflow-x-auto ${
        darkMode ? 'bg-[#141518] border-white/10' : 'bg-zinc-50 border-zinc-200'
      }`}>
        {[
          { id: 'inbox', label: 'SMS Inbox', icon: MessageSquare, count: messages.length },
          { id: 'send', label: 'Send SMS', icon: Send },
          { id: 'calls', label: 'Voice Calls', icon: PhoneCallIcon, count: calls.length },
          { id: 'buy', label: 'Buy Numbers (NOWPayments)', icon: Coins },
          { id: 'logs', label: 'Twilio Logs & Test', icon: FileCode }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
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
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* TAB 1: SMS INBOX */}
        {activeTab === 'inbox' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">SMS Messages</h2>
                <p className="text-xs text-zinc-400">
                  Real-time texts received at {activeNumber.phoneNumber}.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTriggerTestSms}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulate Inbound SMS</span>
              </button>
            </div>

            {messages.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${
                darkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-zinc-200'
              }`}>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center mb-3">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold">No SMS messages yet</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  Send a text message to <strong className="text-white">{activeNumber.phoneNumber}</strong> from any phone, or click "Simulate Inbound SMS" above to test.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5 border rounded-2xl overflow-hidden shadow-sm">
                {messages.map(msg => {
                  const code = extractCode(msg.body);
                  const isOutbound = msg.direction === 'outbound';
                  return (
                    <div
                      key={msg.id}
                      className={`p-4 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        darkMode ? 'bg-white/[0.02] hover:bg-white/[0.04]' : 'bg-white hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isOutbound
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {isOutbound ? 'OUT' : 'IN'}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">
                              {isOutbound ? `To: ${msg.to}` : `From: ${msg.from}`}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {new Date(msg.receivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}
                            </span>
                            {msg.status && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/5 text-zinc-400">
                                {msg.status}
                              </span>
                            )}
                          </div>

                          <p className={`text-xs break-words ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                            {msg.body}
                          </p>

                          {/* 1-Click OTP Code Pill */}
                          {code && (
                            <div className="inline-flex items-center gap-1.5 pt-1">
                              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Code: {code}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(code)}
                                className="text-[11px] font-semibold text-[#FF8C42] hover:underline cursor-pointer flex items-center gap-0.5"
                              >
                                {copiedText === code ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>Copy Code</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.body)}
                          title="Copy text"
                          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          {copiedText === msg.body ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteMessage(msg.id, e)}
                          title="Delete"
                          className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SEND SMS */}
        {activeTab === 'send' && (
          <div className="max-w-xl mx-auto">
            <div className={`p-6 rounded-2xl border ${
              darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200 shadow-sm'
            }`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Compose & Send SMS</h2>
                  <p className="text-xs text-zinc-400">
                    Dispatched instantly via Twilio SMS gateway.
                  </p>
                </div>
              </div>

              {sendResult && (
                <div className={`mb-4 p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                  sendResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {sendResult.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="font-semibold">{sendResult.message}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSendSms} className="space-y-4">
                {/* Sender Number */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    Sender Phone Number (From)
                  </label>
                  <select
                    value={selectedFromNumber}
                    onChange={(e) => setSelectedFromNumber(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none cursor-pointer ${
                      darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                    }`}
                  >
                    {phoneNumbers.map(p => (
                      <option key={p.id} value={p.phoneNumber} className="bg-zinc-900 text-white">
                        {p.friendlyName || p.phoneNumber} ({p.phoneNumber})
                      </option>
                    ))}
                    {!phoneNumbers.some(p => p.phoneNumber === '+17372508034') && (
                      <option value="+17372508034" className="bg-zinc-900 text-white">
                        +1 (737) 250-8034 (Twilio Trial)
                      </option>
                    )}
                  </select>
                </div>

                {/* Recipient Number */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    Recipient Phone Number (To)
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={recipientNumber}
                    onChange={(e) => setRecipientNumber(e.target.value)}
                    required
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border outline-none ${
                      darkMode ? 'bg-white/5 border-white/10 text-white focus:border-[#FF6A00]' : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-[#FF6A00]'
                    }`}
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Include country code (e.g. +1 for US/Canada, +44 for UK).
                  </p>
                </div>

                {/* Message Body */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-400">
                      SMS Message Text
                    </label>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {messageBody.length}/160 chars
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Type your message here..."
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    required
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none resize-none ${
                      darkMode ? 'bg-white/5 border-white/10 text-white focus:border-[#FF6A00]' : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-[#FF6A00]'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-[#FF6A00]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSending ? 'Transmitting SMS...' : 'Send SMS via Twilio'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB: VOICE CALLS (INCOMING & OUTGOING) */}
        {activeTab === 'calls' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>Twilio Voice Calls & Voicemail</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Active on {activeNumber.phoneNumber}
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Make outbound calls with speech greeting & receive calls with audio voicemail recording.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-mono">
                  Voice Webhook: https://goldmailer.xyz/api/webhook/twilio/voice
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: Outbound Call Dialer */}
              <div className="md:col-span-5">
                <div className={`p-5 rounded-2xl border ${
                  darkMode ? 'bg-[#18191e] border-white/10' : 'bg-white border-zinc-200 shadow-sm'
                }`}>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <PhoneCallIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">Make Voice Call</h3>
                      <p className="text-[11px] text-zinc-400">Twilio Outbound Calling</p>
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

                  <form onSubmit={handleMakeCall} className="space-y-3.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Caller ID (From)
                      </label>
                      <select
                        value={selectedFromNumber}
                        onChange={(e) => setSelectedFromNumber(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none cursor-pointer ${
                          darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                        }`}
                      >
                        {phoneNumbers.map(p => (
                          <option key={p.id} value={p.phoneNumber} className="bg-zinc-900 text-white">
                            {p.friendlyName || p.phoneNumber}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Phone Number to Call (To)
                      </label>
                      <input
                        type="tel"
                        placeholder="+15551234567"
                        value={callRecipient}
                        onChange={(e) => setCallRecipient(e.target.value)}
                        required
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${
                          darkMode ? 'bg-white/5 border-white/10 text-white focus:border-emerald-500' : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-emerald-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Voice Message (Text-to-Speech)
                      </label>
                      <textarea
                        rows={3}
                        value={callMessage}
                        onChange={(e) => setCallMessage(e.target.value)}
                        placeholder="Hello, this is a call from GoldMailer..."
                        required
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none resize-none ${
                          darkMode ? 'bg-white/5 border-white/10 text-white focus:border-emerald-500' : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-emerald-500'
                        }`}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isCalling}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <PhoneCallIcon className="w-4 h-4" />
                      <span>{isCalling ? 'Calling Now...' : 'Call Now via Twilio'}</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Call History & Voicemails */}
              <div className="md:col-span-7">
                <div className={`p-5 rounded-2xl border ${
                  darkMode ? 'bg-[#18191e] border-white/10' : 'bg-white border-zinc-200 shadow-sm'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                      <span>Call Logs & Voicemails</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-mono">
                        {calls.length}
                      </span>
                    </h3>
                  </div>

                  {calls.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <PhoneIncoming className="w-10 h-10 mx-auto text-zinc-600 mb-2 stroke-[1.5]" />
                      <p className="text-xs font-semibold text-zinc-400">No calls recorded yet</p>
                      <p className="text-[11px] text-zinc-500 mt-1 max-w-xs mx-auto">
                        Inbound calls to {activeNumber.phoneNumber} and outbound calls will appear here in real-time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {calls.map((call) => {
                        const isInbound = call.direction === 'inbound';
                        return (
                          <div
                            key={call.id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              darkMode ? 'bg-white/[0.03] border-white/5 hover:border-white/10' : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                  isInbound ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#FF6A00]/15 text-[#FF6A00]'
                                }`}>
                                  {isInbound ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold">
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
                                    {new Date(call.startedAt).toLocaleString()} · SID: {call.callSid?.substring(0, 14)}...
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => handleDeleteCall(call.id, e)}
                                className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                                title="Delete call log"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Voicemail Audio Player if recordingUrl exists */}
                            {call.recordingUrl && (
                              <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1.5">
                                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                  <Volume2 className="w-3 h-3" />
                                  <span>Voicemail Recording Available:</span>
                                </span>
                                <audio
                                  controls
                                  src={call.recordingUrl}
                                  className="w-full h-8 rounded-lg"
                                />
                              </div>
                            )}

                            {call.sayMessage && !call.recordingUrl && (
                              <p className="text-xs text-zinc-400 mt-2 bg-black/20 p-2 rounded-lg italic">
                                "{call.sayMessage}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BUY NUMBERS (NOWPAYMENTS GATEWAY) */}
        {activeTab === 'buy' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>NOWPayments Gateway — Phone Number Rental</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">
                    Crypto & Credit
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Rent real US phone numbers powered by Twilio for $2.00 / 30 Days.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExtend30Days(activeNumber.phoneNumber)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Extend Current (+30 Days)</span>
                </button>
              </div>
            </div>

            {buySuccessMessage && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{buySuccessMessage}</span>
              </div>
            )}

            {nowPaymentsInvoiceUrl && (
              <div className="p-4 rounded-xl bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-400" />
                    NOWPayments Invoice Generated
                  </span>
                  <a
                    href={nowPaymentsInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-lg bg-[#FF6A00] text-white font-bold flex items-center gap-1 hover:opacity-90"
                  >
                    <span>Open Checkout</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-zinc-300">
                  Complete payment via NOWPayments (BTC, USDT, ETH, SOL, or Card). Once finished, the webhook automatically extends your number for 30 days.
                </p>
              </div>
            )}

            {/* Numbers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableNumbers.map((num, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-4 ${
                    darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold font-mono text-white">
                        {num.friendlyName || num.phoneNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400">
                        ${num.priceUsd}.00 / 30d
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400">
                      Region: {num.locality || 'US'}, {num.region || 'Local'} · SMS & Verification Ready
                    </p>

                    <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" /> Inbound SMS
                      </span>
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" /> Outbound SMS
                      </span>
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" /> Auto-renew
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      disabled={isBuying}
                      onClick={() => handleBuyWithNowPayments(num.phoneNumber)}
                      className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-95 cursor-pointer disabled:opacity-50"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>Buy via NOWPayments</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBuying}
                      onClick={() => handleActivateNumberDirectly(num.phoneNumber, num.friendlyName)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:bg-white/10 ${
                        darkMode ? 'border-white/10 text-zinc-300' : 'border-zinc-300 text-zinc-800'
                      }`}
                      title="Direct Activate"
                    >
                      Instant Activate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: TWILIO LOGS & LIVE TEST */}
        {activeTab === 'logs' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>Twilio Logs & Gateway Verification</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    twilioMeta.isConfigured
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}>
                    {twilioMeta.isConfigured ? 'Twilio Connected' : 'Configured / Ready'}
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Verify sent & received SMS logs directly to confirm delivery.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Fetch Latest Logs</span>
              </button>
            </div>

            {/* Gateway Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}>
                <span className="text-[11px] text-zinc-400 uppercase font-semibold">Configured Trial Number</span>
                <p className="text-sm font-bold font-mono text-white mt-1">
                  {twilioMeta.trialNumber}
                </p>
              </div>

              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}>
                <span className="text-[11px] text-zinc-400 uppercase font-semibold">Account SID Status</span>
                <p className="text-sm font-bold font-mono text-white mt-1 truncate">
                  {twilioMeta.maskedAccountSid}
                </p>
              </div>

              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}>
                <span className="text-[11px] text-zinc-400 uppercase font-semibold">Webhook Destination</span>
                <p className="text-xs font-mono text-[#FF8C42] mt-1 truncate">
                  {twilioMeta.webhookUrl}
                </p>
              </div>
            </div>

            {/* Test Simulator Buttons */}
            <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
              darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
            }`}>
              <div>
                <h3 className="text-xs font-bold text-white">Full Scan & Live Test Simulation</h3>
                <p className="text-[11px] text-zinc-400">Trigger simulated incoming webhook or send real text to verify log entry.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerTestSms}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Receive Test SMS (Webhook)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('send')}
                  className="px-3 py-1.5 rounded-xl bg-[#FF6A00] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:opacity-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Outbound SMS</span>
                </button>
              </div>
            </div>

            {/* Logs Table */}
            <div className={`border rounded-2xl overflow-hidden ${
              darkMode ? 'bg-[#18191d] border-white/10' : 'bg-white border-zinc-200'
            }`}>
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Twilio Transmission Log Entries ({twilioLogs.length + messages.length})
                </span>
                <span className="text-[11px] text-emerald-400 font-mono">Live Sync Active</span>
              </div>

              <div className="divide-y divide-white/5 overflow-x-auto">
                {(twilioLogs.length > 0 ? twilioLogs : messages).map((log: any, i) => (
                  <div key={log.sid || i} className="p-3.5 flex items-center justify-between gap-4 text-xs hover:bg-white/[0.02]">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-400 text-[11px] truncate max-w-[120px]">
                          {log.sid}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                          log.status === 'delivered' || log.status === 'received' || log.status === 'sent'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {log.status || 'delivered'}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {log.direction || 'inbound'}
                        </span>
                      </div>
                      <p className="text-zinc-200 truncate max-w-md">
                        {log.body}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0 text-[11px] font-mono text-zinc-500">
                      <div>{log.from} → {log.to}</div>
                      <div>{new Date(log.dateSent || log.receivedAt || Date.now()).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
