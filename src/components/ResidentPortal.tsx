import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { KeyRound, ShieldAlert, Sparkles, Home, User, Users, CheckCircle, ArrowRight, AlertCircle, RefreshCw, Ticket, Info, ChevronRight, UtensilsCrossed, Leaf } from 'lucide-react';
import { SocietyEvent, PassRecord } from '../types';
import { normalizeHouseNo, generateQRPayload } from '../utils/qr';
import { saveIssuedPass, getStoredIssuedPasses } from '../utils/storage';
import { PassCard } from './PassCard';

interface ResidentPortalProps {
  activeEvent: SocietyEvent;
  allEvents: SocietyEvent[];
  onSwitchToScanner: () => void;
  onSwitchToAdmin: () => void;
}

export const ResidentPortal: React.FC<ResidentPortalProps> = ({
  activeEvent,
  onSwitchToScanner,
}) => {
  // State for password gate
  const [passwordInput, setPasswordInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // State for verification form
  const [houseNo, setHouseNo] = useState('');
  const [residentName, setResidentName] = useState('');
  const [memberCount, setMemberCount] = useState<number>(0);
  const [foodPreference, setFoodPreference] = useState<'regular' | 'swaminarayan_jain'>('regular');
  const [swaminarayanCount, setSwaminarayanCount] = useState<number>(0);
  const [phone, setPhone] = useState('');

  // State for validation & pass generation
  const [errorMessage, setErrorMessage] = useState('');
  const [isUnpaidError, setIsUnpaidError] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [generatedPass, setGeneratedPass] = useState<PassRecord | null>(null);
  const [existingPasses, setExistingPasses] = useState<PassRecord[]>([]);

  // Check if this event was previously unlocked or if resident already generated a pass
  useEffect(() => {
    const sessionKey = `unlocked_event_${activeEvent.id}`;
    if (sessionStorage.getItem(sessionKey) === 'true') {
      setIsUnlocked(true);
    } else {
      setIsUnlocked(false);
      setPasswordInput('');
    }

    // Load any existing passes for this event
    const passes = getStoredIssuedPasses().filter((p) => p.eventId === activeEvent.id);
    setExistingPasses(passes);
    setGeneratedPass(null);
    setErrorMessage('');
    setIsUnpaidError(false);
  }, [activeEvent.id]);

  const handleUnlockGate = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = passwordInput.trim();
    if (entered === activeEvent.eventPassword.trim()) {
      setIsUnlocked(true);
      setPasswordError('');
      sessionStorage.setItem(`unlocked_event_${activeEvent.id}`, 'true');
    } else {
      setPasswordError(`Incorrect password. Please verify the event access password with the committee.`);
    }
  };

  const handleHouseInputChange = (val: string) => {
    setErrorMessage('');
    setIsUnpaidError(false);
    // If user enters letters (like A, B, A-101, etc.), pop up the warning alert
    if (/[a-zA-Z]/.test(val)) {
      setShowLetterModal(true);
      const cleanDigits = val.replace(/\D/g, '');
      setHouseNo(cleanDigits);
      return;
    }
    const cleanDigits = val.replace(/\D/g, '');
    setHouseNo(cleanDigits);
  };

  const handleVerifyAndGeneratePass = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsUnpaidError(false);

    // Check if input has letters like A or B (e.g. A-101)
    if (/[a-zA-Z]/.test(houseNo)) {
      setShowLetterModal(true);
      setErrorMessage('Please add only house number without A & B. Enter House Number (e.g. 102).');
      const cleanDigits = houseNo.replace(/\D/g, '');
      setHouseNo(cleanDigits);
      return;
    }

    if (!houseNo.trim()) {
      setErrorMessage('Please enter your House Number (e.g. 102).');
      return;
    }

    // Strict numerical check: 1 to 259
    const num = parseInt(houseNo.trim(), 10);
    if (isNaN(num) || num < 1 || num > 259) {
      setErrorMessage('House number must be a numerical value from 1 to 259.');
      return;
    }

    if (!residentName.trim()) {
      setErrorMessage('Please enter the Primary Resident Name.');
      return;
    }
    if (!memberCount || memberCount < 1) {
      setErrorMessage('Please add at least 1 attending family member by clicking the + button.');
      return;
    }

    const normalizedInputHouse = num.toString();
    const normalizedPaidList = activeEvent.paidHouses.map((h) => normalizeHouseNo(h));

    // Core validation rule: check against pre-approved paid houses
    const isPaid = normalizedPaidList.includes(normalizedInputHouse);

    if (!isPaid) {
      setIsUnpaidError(true);
      setErrorMessage(`Pass generation is restricted. House ${normalizedInputHouse} has not submitted the society festival contribution of ₹${activeEvent.contributionAmount}. Pay Festival Contribution immediately to unlock pass.`);
      return;
    }

    // Construct Pass
    const passId = `${activeEvent.eventCode}-${normalizedInputHouse}-${Math.floor(1000 + Math.random() * 9000)}`;
    const swamiFinalCount = Math.min(memberCount, Math.max(0, swaminarayanCount));
    const finalFoodPref = foodPreference === 'swaminarayan_jain' || swamiFinalCount > 0 ? 'swaminarayan_jain' : 'regular';

    const qrPayload = generateQRPayload(
      activeEvent.eventCode,
      normalizedInputHouse,
      residentName,
      memberCount,
      swamiFinalCount,
      finalFoodPref
    );

    const newPass: PassRecord = {
      id: passId,
      eventId: activeEvent.id,
      eventCode: activeEvent.eventCode,
      societyName: activeEvent.societyName,
      eventName: activeEvent.name,
      houseNo: normalizedInputHouse,
      residentName: residentName.trim(),
      memberCount,
      foodPreference: finalFoodPref,
      swaminarayanCount: swamiFinalCount,
      phone: phone.trim() || undefined,
      qrPayload,
      issuedAt: new Date().toISOString(),
      amountPaid: activeEvent.contributionAmount,
    };

    saveIssuedPass(newPass);
    setGeneratedPass(newPass);
    setExistingPasses((prev) => [newPass, ...prev.filter((p) => p.houseNo !== newPass.houseNo)]);

    // Trigger celebratory confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ea580c', '#f59e0b', '#10b981', '#ffffff'],
      });
    } catch {
      // ignore
    }
  };

  const loadExistingPass = (pass: PassRecord) => {
    setGeneratedPass(pass);
    setHouseNo(pass.houseNo);
    setResidentName(pass.residentName);
    setMemberCount(pass.memberCount);
    setFoodPreference(pass.foodPreference || (pass.swaminarayanCount && pass.swaminarayanCount > 0 ? 'swaminarayan_jain' : 'regular'));
    setSwaminarayanCount(pass.swaminarayanCount || 0);
    setErrorMessage('');
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      {/* Event Header Banner */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
        
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-200">
          <span className="uppercase tracking-widest">{activeEvent.societyName}</span>
          <span className="bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full text-white">
            Code: {activeEvent.eventCode}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black mt-2 tracking-tight">
          {activeEvent.name}
        </h1>
        <p className="text-sm text-amber-100 mt-1">
          {activeEvent.venue} • {activeEvent.date}
        </p>

        <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-amber-100">
            <span>Contribution:</span>
            <span className="font-bold text-white text-sm bg-black/20 px-2 py-0.5 rounded-md">
              ₹{activeEvent.contributionAmount.toLocaleString()}
            </span>
          </div>
          <div className="text-amber-200 text-xs">
            {activeEvent.paidHouses.length} Verified Houses Pre-Approved
          </div>
        </div>
      </div>

      {/* Screen 1: Access Gate (Password Required) */}
      {!isUnlocked ? (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-amber-200/80">
          <div className="text-center max-w-md mx-auto">
            <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 mx-auto shadow-inner mb-4">
              <KeyRound className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-bold text-stone-900">
              Event Access Gate
            </h2>
            <p className="text-sm text-stone-600 mt-1.5">
              Enter the access password shared by your society committee or floor coordinator to generate your digital event pass.
            </p>

            <form onSubmit={handleUnlockGate} className="mt-6 space-y-4">
              <div className="text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                  Event Access Password
                </label>
                <div className="relative">
                  <input
                    id="input-event-password"
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="e.g. Ganesh@2026"
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-stone-900 font-medium transition"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordInput(activeEvent.eventPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-orange-600 hover:text-orange-800 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200 transition"
                  >
                    Use Demo Password
                  </button>
                </div>
              </div>

              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-medium text-red-700 text-left animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{passwordError}</span>
                </div>
              )}

              <button
                id="btn-unlock-gate"
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99]"
              >
                <span>Unlock Pass Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
              <span>Password configured by committee: <strong className="font-mono text-stone-700">{activeEvent.eventPassword}</strong></span>
            </div>
          </div>
        </div>
      ) : generatedPass ? (
        /* Screen 3: Generated Pass View */
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-sm font-semibold">
                Pass Verified &amp; Generated for House {generatedPass.houseNo}
              </span>
            </div>
            <button
              onClick={() => setGeneratedPass(null)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Change Details
            </button>
          </div>

          <PassCard
            pass={generatedPass}
            event={activeEvent}
            onClose={() => setGeneratedPass(null)}
          />
        </div>
      ) : (
        /* Screen 2: Verification Form */
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-amber-200/80 space-y-6">
          <div className="pb-4 border-b border-stone-100">
            <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              <Ticket className="w-5 h-5 text-orange-600" />
              Resident Self-Service Pass
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Verify your house contribution and generate your entrance pass
            </p>
          </div>

          {/* Verification Error Notice */}
          {errorMessage && (
            <div
              id="verification-error-alert"
              className={`p-4 rounded-2xl flex items-start gap-3 shadow-xs ${
                isUnpaidError
                  ? 'bg-red-50 border-2 border-red-300 text-red-900'
                  : 'bg-amber-50 border-2 border-amber-300 text-amber-950'
              }`}
            >
              {isUnpaidError ? (
                <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="text-sm flex-1">
                {isUnpaidError ? (
                  <>
                    <p className="font-bold text-red-950 text-sm">
                      Festival Contribution Required (₹{activeEvent.contributionAmount})
                    </p>
                    <p className="text-xs text-red-800 mt-1 font-semibold leading-relaxed">
                      Pass generation is restricted. House {houseNo} has not submitted the society festival contribution of ₹{activeEvent.contributionAmount}. Pay Festival Contribution immediately to unlock your pass.
                    </p>
                    <div className="mt-2 text-xs text-red-700 bg-red-100/70 p-2 rounded-lg">
                      💡 <strong>Already Paid?</strong> Please contact your committee coordinator to update your house number in the list.
                    </div>
                  </>
                ) : (
                  <p className="font-bold text-amber-950 text-sm">{errorMessage}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setIsUnpaidError(false);
                }}
                className="text-stone-400 hover:text-stone-600 text-xs font-bold px-1"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleVerifyAndGeneratePass} className="space-y-5">
            {/* House Number */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5 text-orange-600" />
                  House Number (1 to 259) <span className="text-red-500">*</span>
                </span>
                <span className="text-[11px] font-semibold text-orange-700">Only numbers 1 to 259 (No A or B)</span>
              </label>
              <div className="relative">
                <input
                  id="input-house-number"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={houseNo}
                  onChange={(e) => handleHouseInputChange(e.target.value)}
                  placeholder="ENTER HOUSE NUMBER (E.g. 102)"
                  className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-stone-900 font-bold uppercase text-lg transition"
                  required
                />
              </div>

              {/* Quick house helpers */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                <span className="text-[11px] font-medium">Quick Select Sample:</span>
                {activeEvent.paidHouses.slice(0, 6).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setHouseNo(h);
                      setErrorMessage('');
                      setIsUnpaidError(false);
                    }}
                    className="px-2.5 py-1 rounded-md bg-stone-100 hover:bg-orange-100 text-stone-800 hover:text-orange-900 border border-stone-200 text-xs font-bold transition"
                  >
                    House {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Resident Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-orange-600" />
                Primary Resident Name <span className="text-red-500">*</span>
              </label>
              <input
                id="input-resident-name"
                type="text"
                value={residentName}
                onChange={(e) => {
                  setResidentName(e.target.value);
                  setErrorMessage('');
                  setIsUnpaidError(false);
                }}
                placeholder="e.g. Shrikunj Patel"
                className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-stone-900 font-medium transition"
                required
              />
            </div>

            {/* Number of Family Members Attending (Dinner Pass Count) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-orange-600" />
                  Attending Family Members (Dinner Count) <span className="text-red-500">*</span>
                </span>
                <span className={`text-xs font-bold ${memberCount === 0 ? 'text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full' : 'text-orange-600'}`}>
                  {memberCount === 0 ? '0 (Tap + to add)' : `${memberCount} ${memberCount === 1 ? 'Person' : 'Persons'}`}
                </span>
              </label>
              
              <div className="flex items-center gap-3">
                <button
                  id="btn-decrement-members"
                  type="button"
                  onClick={() => {
                    setMemberCount((prev) => Math.max(0, prev - 1));
                    setErrorMessage('');
                    setIsUnpaidError(false);
                  }}
                  disabled={memberCount <= 0}
                  className="w-12 h-12 rounded-xl bg-stone-100 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed text-stone-800 font-bold text-2xl flex items-center justify-center transition active:scale-95 border border-stone-200 shadow-2xs"
                  title="Reduce member count"
                >
                  -
                </button>
                <div
                  id="box-member-count"
                  className={`flex-1 py-2.5 px-4 rounded-xl border-2 text-center transition ${
                    memberCount === 0
                      ? 'border-amber-300 bg-amber-50/70 text-amber-900 shadow-inner'
                      : 'border-stone-200 bg-stone-50 text-stone-900'
                  }`}
                >
                  <span className="font-black text-2xl leading-none block">{memberCount}</span>
                  <span className="text-[10px] uppercase font-bold text-stone-400 block mt-0.5">
                    {memberCount === 0 ? 'Tap + to Add Members' : memberCount === 1 ? 'Attending Person' : 'Attending Persons'}
                  </span>
                </div>
                <button
                  id="btn-increment-members"
                  type="button"
                  onClick={() => {
                    setMemberCount((prev) => Math.min(15, prev + 1));
                    setErrorMessage('');
                    setIsUnpaidError(false);
                  }}
                  className="w-12 h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-2xl flex items-center justify-center transition active:scale-95 shadow-md shadow-orange-600/20"
                  title="Add member count"
                >
                  +
                </button>
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">
                {memberCount === 0
                  ? 'Tap the + button to add each attending family member.'
                  : 'Volunteers scan this pass at the gate to admit your entire family for dinner and venue entry.'}
              </p>
            </div>

            {/* Food & Prasad Dietary Preference */}
            <div className="bg-stone-50/80 rounded-2xl p-4 border border-stone-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
                  Prasad / Dinner Dietary Preference
                </label>
                <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                  <Leaf className="w-3 h-3 text-emerald-600" />
                  100% Pure Veg
                </span>
              </div>

              {/* Quick Preset Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFoodPreference('regular');
                    setSwaminarayanCount(0);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border text-center ${
                    foodPreference === 'regular' && swaminarayanCount === 0
                      ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <span>Regular Pure Veg</span>
                  <span className={`text-[10px] font-normal ${foodPreference === 'regular' && swaminarayanCount === 0 ? 'text-orange-100' : 'text-stone-400'}`}>
                    All Regular
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFoodPreference('swaminarayan_jain');
                    setSwaminarayanCount(memberCount || 1);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border text-center ${
                    foodPreference === 'swaminarayan_jain' && swaminarayanCount === (memberCount || 1)
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <Leaf className="w-3 h-3 text-emerald-400" />
                    Swaminarayan / Jain
                  </span>
                  <span className={`text-[10px] font-normal ${foodPreference === 'swaminarayan_jain' && swaminarayanCount === (memberCount || 1) ? 'text-emerald-100' : 'text-stone-400'}`}>
                    No Onion &amp; Garlic
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFoodPreference('swaminarayan_jain');
                    if (swaminarayanCount === 0 || swaminarayanCount === memberCount) {
                      setSwaminarayanCount(Math.max(1, Math.floor(memberCount / 2) || 1));
                    }
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border text-center ${
                    swaminarayanCount > 0 && swaminarayanCount < (memberCount || 1)
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <span>Mixed Dietary</span>
                  <span className={`text-[10px] font-normal ${swaminarayanCount > 0 && swaminarayanCount < (memberCount || 1) ? 'text-amber-100' : 'text-stone-400'}`}>
                    Split counts
                  </span>
                </button>
              </div>

              {/* Detailed Breakdown Controls */}
              {memberCount > 0 && (
                <div className="pt-2 border-t border-stone-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                      <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                      Swaminarayan / Jain count (No Onion &amp; Garlic):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, swaminarayanCount - 1);
                          setSwaminarayanCount(next);
                          if (next === 0) setFoodPreference('regular');
                        }}
                        disabled={swaminarayanCount <= 0}
                        className="w-7 h-7 rounded-lg bg-white border border-stone-300 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-stone-700 hover:bg-stone-100 flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-sm text-stone-900">
                        {swaminarayanCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(memberCount, swaminarayanCount + 1);
                          setSwaminarayanCount(next);
                          if (next > 0) setFoodPreference('swaminarayan_jain');
                        }}
                        disabled={swaminarayanCount >= memberCount}
                        className="w-7 h-7 rounded-lg bg-white border border-stone-300 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-stone-700 hover:bg-stone-100 flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Summary Tag */}
                  <div className="p-2 rounded-xl bg-white border border-stone-200 text-xs font-medium text-stone-600 flex items-center justify-between">
                    <span>Catering Allocation:</span>
                    <span className="font-bold text-stone-800">
                      {swaminarayanCount === 0 ? (
                        <span className="text-orange-700">{memberCount} Regular Pure Veg Meals</span>
                      ) : swaminarayanCount === memberCount ? (
                        <span className="text-emerald-700">All {memberCount} Swaminarayan/Jain Meals</span>
                      ) : (
                        <span>
                          <strong className="text-emerald-700">{swaminarayanCount} Swaminarayan/Jain</strong> + <strong className="text-orange-700">{memberCount - swaminarayanCount} Regular</strong>
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Phone */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                Mobile Number (Optional)
              </label>
              <input
                id="input-resident-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-stone-900 font-medium text-sm transition"
              />
            </div>

            {/* Submit Button */}
            <button
              id="btn-generate-pass"
              type="submit"
              className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 hover:from-orange-700 hover:to-amber-700 text-white font-extrabold text-base shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2.5 transition active:scale-[0.99]"
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span>Verify &amp; Generate Digital Pass</span>
            </button>
          </form>

          {/* Quick Volunteer Scanner Link */}
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 text-center flex items-center justify-between">
            <div className="text-left">
              <p className="text-xs font-bold text-stone-800">Are you a Festival Committee Volunteer?</p>
              <p className="text-[11px] text-stone-500">Scan passes at the venue</p>
            </div>
            <button
              onClick={onSwitchToScanner}
              className="px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition"
            >
              Open QR Scanner
            </button>
          </div>
        </div>
      )}

      {/* Popup Modal: Warn user to enter ONLY numeric house number without A or B */}
      {showLetterModal && (
        <div
          id="modal-letter-warning"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border-2 border-amber-300 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-stone-900">
                Only House Number Allowed
              </h3>
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-950 font-extrabold text-sm leading-snug">
                Please add only house number without A & B.
              </div>
              <p className="text-base font-black text-orange-600 tracking-wide mt-1">
                ENTER HOUSE NUMBER (E.g. 102)
              </p>
              <p className="text-xs text-stone-500">
                Society house numbers are strictly numerical from <strong>1 to 259</strong>.
              </p>
            </div>

            <button
              id="btn-confirm-house-popup"
              type="button"
              onClick={() => {
                setShowLetterModal(false);
                const inputEl = document.getElementById('input-house-number');
                if (inputEl) inputEl.focus();
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-bold text-sm shadow-md transition"
            >
              OK, Enter House Number (1 - 259)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
