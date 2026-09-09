import React, { useState, useEffect } from 'react';
import {
  Ticket,
  Camera,
  ShieldCheck,
  Calendar,
  Sparkles,
  ChevronDown,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { SocietyEvent, PassRecord, GateCheckInRecord } from './types';
import {
  getStoredEvents,
  getActiveEventId,
  setActiveEventId,
  getStoredIssuedPasses,
  getStoredCheckIns,
  getAdminMasterPin,
} from './utils/storage';
import { ResidentPortal } from './components/ResidentPortal';
import { GateScanner } from './components/GateScanner';
import { AdminPanel } from './components/AdminPanel';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

export default function App() {
  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [activeEventId, setActiveEventIdState] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<'resident' | 'scanner' | 'admin'>('resident');
  const [issuedPasses, setIssuedPasses] = useState<PassRecord[]>([]);
  const [checkIns, setCheckIns] = useState<GateCheckInRecord[]>([]);
  const [showEventDropdown, setShowEventDropdown] = useState(false);

  // Security: Staff / Committee mode is locked by default so residents never see admin controls
  const [isStaffUnlocked, setIsStaffUnlocked] = useState<boolean>(() => {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('society_staff_auth') === 'true';
  });
  const [showStaffLoginModal, setShowStaffLoginModal] = useState<boolean>(false);
  const [staffPinInput, setStaffPinInput] = useState('');
  const [staffLoginError, setStaffLoginError] = useState('');
  const [staffLoginTarget, setStaffLoginTarget] = useState<'admin' | 'scanner'>('admin');
  const [showPinText, setShowPinText] = useState(false);

  // Initialize data from local storage & URL params
  useEffect(() => {
    const loadedEvents = getStoredEvents();
    setEvents(loadedEvents);

    const activeId = getActiveEventId();
    setActiveEventIdState(activeId);

    setIssuedPasses(getStoredIssuedPasses());
    setCheckIns(getStoredCheckIns());

    // Check URL parameters for direct event or staff routes
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlEventCode = params.get('event');
      const urlMode = params.get('mode');

      if (urlEventCode) {
        const found = loadedEvents.find(
          (e) => e.eventCode.toLowerCase() === urlEventCode.toLowerCase() || e.id === urlEventCode
        );
        if (found) {
          setActiveEventIdState(found.id);
          setActiveEventId(found.id);
        }
      }

      if (urlMode === 'admin') {
        setStaffLoginTarget('admin');
        setShowStaffLoginModal(true);
      } else if (urlMode === 'scanner') {
        setStaffLoginTarget('scanner');
        setShowStaffLoginModal(true);
      }
    }
  }, []);

  const activeEvent =
    events.find((e) => e.id === activeEventId) || events[0] || null;

  const handleUpdateEvents = (updatedEvents: SocietyEvent[], newActiveId?: string) => {
    setEvents(updatedEvents);
    if (newActiveId) {
      setActiveEventIdState(newActiveId);
    }
  };

  const handleUpdatePasses = (newPasses: PassRecord[]) => {
    setIssuedPasses(newPasses);
  };

  const handleUpdateCheckIns = (newCheckIns: GateCheckInRecord[]) => {
    setCheckIns(newCheckIns);
  };

  const handleSwitchActiveEvent = (eventId: string) => {
    setActiveEventIdState(eventId);
    setActiveEventId(eventId);
    setShowEventDropdown(false);
  };

  const handleStaffLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const pin = staffPinInput.trim();
    const masterPin = getAdminMasterPin();

    if (staffLoginTarget === 'admin') {
      // Must match Committee Admin PIN: strictly configured Master PIN or 1234
      if (pin === masterPin || pin === '1234') {
        setIsStaffUnlocked(true);
        sessionStorage.setItem('society_staff_auth', 'true');
        setCurrentTab('admin');
        setShowStaffLoginModal(false);
        setStaffPinInput('');
        setStaffLoginError('');
      } else {
        setStaffLoginError('Incorrect Admin PIN. Enter 1234.');
      }
    } else {
      // Volunteer Gate Scanner Tab: password is 1111 (or Master PIN 1234)
      if (
        pin === '1111' ||
        pin === masterPin ||
        pin === '1234' ||
        (activeEvent && pin.toLowerCase() === activeEvent.eventPassword.toLowerCase())
      ) {
        setIsStaffUnlocked(true);
        sessionStorage.setItem('society_staff_auth', 'true');
        setCurrentTab('scanner');
        setShowStaffLoginModal(false);
        setStaffPinInput('');
        setStaffLoginError('');
      } else {
        setStaffLoginError('Incorrect Gate Scanner Password. Enter 1111.');
      }
    }
  };

  const handleLockStaff = () => {
    setIsStaffUnlocked(false);
    sessionStorage.removeItem('society_staff_auth');
    setCurrentTab('resident');
  };

  if (!activeEvent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-amber-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-stone-700">Loading society events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-100 text-stone-900 selection:bg-orange-500 selection:text-white">
      {/* Offline Status Indicator */}
      <OfflineIndicator />

      {/* Society App Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-amber-200/80 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Logo & Society Brand */}
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-sm shrink-0">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-stone-900 leading-tight">
                    SocietyPass
                  </h1>
                  <span className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 uppercase tracking-wide">
                    <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                    Offline Ready
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 truncate max-w-[180px] sm:max-w-xs">
                  {activeEvent.societyName}
                </p>
              </div>
            </div>

            {/* Event Selector, PWA & Staff Lock */}
            <div className="flex items-center gap-2">
              {/* Event Switcher Dropdown */}
              <div className="relative">
                <button
                  id="event-switcher-btn"
                  onClick={() => setShowEventDropdown(!showEventDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300/80 text-xs font-bold text-amber-950 transition active:scale-95 shadow-2xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-orange-600" />
                  <span className="max-w-[110px] sm:max-w-[160px] truncate">
                    {activeEvent.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                </button>

                {showEventDropdown && (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white p-2 shadow-2xl border border-stone-200 z-50 animate-scale-up">
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Active Festival / Event
                    </p>
                    <div className="space-y-1 mt-1">
                      {events.map((evt) => (
                        <button
                          key={evt.id}
                          onClick={() => handleSwitchActiveEvent(evt.id)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                            evt.id === activeEvent.id
                              ? 'bg-orange-600 text-white shadow-xs'
                              : 'text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <span className="truncate">{evt.name}</span>
                          <span className="text-[10px] font-mono opacity-80 shrink-0 ml-2">
                            {evt.eventCode}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* In-App PWA Install Button */}
              <PWAInstallButton />

              {/* Staff Access Icon Button */}
              {isStaffUnlocked ? (
                <button
                  onClick={handleLockStaff}
                  title="Lock Committee Mode"
                  className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition flex items-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Exit Staff</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setStaffLoginTarget('admin');
                    setShowStaffLoginModal(true);
                  }}
                  title="Committee & Staff Login"
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition"
                >
                  <Lock className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs — ONLY VISIBLE TO AUTHENTICATED COMMITTEE / STAFF */}
          {isStaffUnlocked && (
            <nav className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-center gap-1.5 animate-fade-in">
              <button
                id="tab-resident-portal"
                onClick={() => setCurrentTab('resident')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  currentTab === 'resident'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <Ticket className="w-4 h-4" />
                <span>Resident Pass</span>
              </button>

              <button
                id="tab-gate-scanner"
                onClick={() => setCurrentTab('scanner')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  currentTab === 'scanner'
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <Camera className="w-4 h-4 text-orange-400" />
                <span>QR Scanner</span>
              </button>

              <button
                id="tab-admin-panel"
                onClick={() => setCurrentTab('admin')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  currentTab === 'admin'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Admin Panel</span>
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {currentTab === 'resident' && (
          <ResidentPortal
            activeEvent={activeEvent}
            allEvents={events}
            onSwitchToScanner={() => {
              if (isStaffUnlocked) {
                setCurrentTab('scanner');
              } else {
                setStaffLoginTarget('scanner');
                setShowStaffLoginModal(true);
              }
            }}
            onSwitchToAdmin={() => {
              if (isStaffUnlocked) {
                setCurrentTab('admin');
              } else {
                setStaffLoginTarget('admin');
                setShowStaffLoginModal(true);
              }
            }}
          />
        )}

        {currentTab === 'scanner' && (
          <GateScanner
            activeEvent={activeEvent}
            allEvents={events}
            onSwitchToAdmin={() => setCurrentTab('admin')}
            issuedPasses={issuedPasses}
          />
        )}

        {currentTab === 'admin' && (
          <AdminPanel
            events={events}
            activeEvent={activeEvent}
            onUpdateEvents={handleUpdateEvents}
            issuedPasses={issuedPasses}
            checkIns={checkIns}
            onUpdatePasses={handleUpdatePasses}
            onUpdateCheckIns={handleUpdateCheckIns}
            onLockAdmin={handleLockStaff}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-5 text-center text-xs text-stone-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <span>{activeEvent.societyName}</span>
            <span>•</span>
            <span className="text-orange-600 font-bold">{activeEvent.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-stone-400">
              Offline-First Residential Pass &amp; Gate Verification
            </span>
            <span>•</span>
            {isStaffUnlocked ? (
              <button
                onClick={handleLockStaff}
                className="text-[11px] text-red-600 hover:text-red-700 font-bold underline cursor-pointer"
              >
                Exit Staff Mode
              </button>
            ) : (
              <button
                onClick={() => {
                  setStaffLoginTarget('admin');
                  setShowStaffLoginModal(true);
                }}
                className="text-[11px] text-stone-400 hover:text-orange-600 font-medium underline cursor-pointer"
              >
                Committee &amp; Staff Login
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Staff Login Modal (Protects Admin Panel & Gate Scanner from normal residents) */}
      {showStaffLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-stone-900">
                  {staffLoginTarget === 'admin' ? 'Committee Admin Login' : 'QR Scanner Login'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowStaffLoginModal(false);
                  setStaffLoginError('');
                  setStaffPinInput('');
                }}
                className="text-stone-400 hover:text-stone-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Target Mode Toggle */}
            <div className="flex rounded-xl bg-stone-100 p-1 mt-4">
              <button
                type="button"
                onClick={() => {
                  setStaffLoginTarget('admin');
                  setStaffLoginError('');
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  staffLoginTarget === 'admin'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Committee Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  setStaffLoginTarget('scanner');
                  setStaffLoginError('');
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  staffLoginTarget === 'scanner'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                QR Scanner
              </button>
            </div>

            <p className="text-xs text-stone-500 mt-3 text-center">
              {staffLoginTarget === 'admin'
                ? 'Enter Committee Admin PIN (1234) to access event setup and paid house lists.'
                : 'Enter Gate Scanner Password (1111) to open the QR scanner.'}
            </p>

            <form onSubmit={handleStaffLogin} className="mt-4 space-y-3.5">
              <div>
                <div className="relative">
                  <input
                    type={showPinText ? 'text' : 'password'}
                    value={staffPinInput}
                    onChange={(e) => setStaffPinInput(e.target.value)}
                    placeholder={
                      staffLoginTarget === 'admin'
                        ? 'Enter Admin PIN (1234)'
                        : 'Enter Scanner Password (1111)'
                    }
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-300 text-center text-sm font-mono font-bold tracking-widest focus:border-orange-500 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinText(!showPinText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    {showPinText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {staffLoginError && (
                  <p className="text-xs font-semibold text-red-600 text-center mt-2">
                    {staffLoginError}
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStaffLoginModal(false);
                    setStaffLoginError('');
                    setStaffPinInput('');
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
