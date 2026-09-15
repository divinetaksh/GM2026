import React, { useState, useEffect } from 'react';
import {
  Ticket,
  Camera,
  ShieldCheck,
  QrCode,
  Calendar,
  Sparkles,
  ChevronDown,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  Cloud,
  Database,
} from 'lucide-react';
import { SocietyEvent, PassRecord, GateCheckInRecord } from './types';
import {
  getStoredEvents,
  getActiveEventId,
  setActiveEventId,
  getStoredIssuedPasses,
  getStoredCheckIns,
  getAdminMasterPin,
  isAuthorizedAdminPin,
  isAuthorizedCommitteePin,
  saveStoredEvents,
  subscribeToCloudEvents,
  subscribeToCloudPasses,
  subscribeToCloudCheckIns,
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
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'syncing' | 'offline'>('syncing');

  // Security Role: 'resident' (default), 'committee' (scanner only), 'admin' (all writes & delete rights)
  const [authRole, setAuthRole] = useState<'resident' | 'committee' | 'admin'>(() => {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem('society_auth_role');
      if (stored === 'admin') return 'admin';
      if (stored === 'committee') return 'committee';
      if (sessionStorage.getItem('society_staff_auth') === 'true') return 'admin';
    }
    return 'resident';
  });
  const [showStaffLoginModal, setShowStaffLoginModal] = useState<boolean>(false);
  const [staffPinInput, setStaffPinInput] = useState('');
  const [staffLoginError, setStaffLoginError] = useState('');
  const [staffLoginTarget, setStaffLoginTarget] = useState<'committee' | 'admin'>('committee');
  const [showPinText, setShowPinText] = useState(false);

  // Initialize data from local cache & attach real-time Firebase Firestore listeners
  useEffect(() => {
    // Immediate fast local render
    const loadedEvents = getStoredEvents();
    setEvents(loadedEvents);

    const activeId = getActiveEventId();
    setActiveEventIdState(activeId);

    setIssuedPasses(getStoredIssuedPasses());
    setCheckIns(getStoredCheckIns());

    // Check URL parameters for direct event or mode routes
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
      } else if (urlMode === 'scanner' || urlMode === 'committee') {
        setStaffLoginTarget('committee');
        setShowStaffLoginModal(true);
      }
    }

    // Attach real-time cloud listeners
    const unsubEvents = subscribeToCloudEvents(
      (cloudEvents) => {
        if (cloudEvents && cloudEvents.length > 0) {
          setEvents(cloudEvents);
          setCloudStatus('connected');
        }
      },
      () => setCloudStatus('offline')
    );

    const unsubPasses = subscribeToCloudPasses(
      (cloudPasses) => {
        setIssuedPasses(cloudPasses);
        setCloudStatus('connected');
      },
      () => setCloudStatus('offline')
    );

    const unsubCheckIns = subscribeToCloudCheckIns(
      (cloudCheckIns) => {
        setCheckIns(cloudCheckIns);
        setCloudStatus('connected');
      },
      () => setCloudStatus('offline')
    );

    return () => {
      unsubEvents();
      unsubPasses();
      unsubCheckIns();
    };
  }, []);

  const activeEvent =
    events.find((e) => e.id === activeEventId) || events[0] || null;

  const handleUpdateEvents = (updatedEvents: SocietyEvent[], newActiveId?: string) => {
    setEvents(updatedEvents);
    saveStoredEvents(updatedEvents);
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

    if (staffLoginTarget === 'admin') {
      // Main Admin Mode: Password is 123456 (All rights to remove/delete/modify data)
      if (isAuthorizedAdminPin(pin)) {
        setAuthRole('admin');
        sessionStorage.setItem('society_auth_role', 'admin');
        setCurrentTab('admin');
        setShowStaffLoginModal(false);
        setStaffPinInput('');
        setStaffLoginError('');
      } else {
        setStaffLoginError('Incorrect password. Access denied.');
      }
    } else {
      // Committee Mode: QR Gate Scanner (Password: 1234)
      if (isAuthorizedCommitteePin(pin)) {
        const role = isAuthorizedAdminPin(pin) ? 'admin' : 'committee';
        setAuthRole(role);
        sessionStorage.setItem('society_auth_role', role);
        setCurrentTab('scanner');
        setShowStaffLoginModal(false);
        setStaffPinInput('');
        setStaffLoginError('');
      } else {
        setStaffLoginError('Incorrect password. Access denied.');
      }
    }
  };

  const handleLockStaff = () => {
    setAuthRole('resident');
    sessionStorage.removeItem('society_auth_role');
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
                  <span
                    title={cloudStatus === 'connected' ? 'Connected to Google Firebase Cloud Database' : 'Connecting to Cloud...'}
                    className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                      cloudStatus === 'connected'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : cloudStatus === 'syncing'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-stone-100 text-stone-600 border-stone-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        cloudStatus === 'connected'
                          ? 'bg-emerald-500 animate-pulse'
                          : cloudStatus === 'syncing'
                          ? 'bg-amber-500 animate-spin'
                          : 'bg-stone-400'
                      }`}
                    />
                    <Cloud className="w-2.5 h-2.5" />
                    <span>{cloudStatus === 'connected' ? 'Cloud Online' : cloudStatus === 'syncing' ? 'Syncing...' : 'Local Cache'}</span>
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 truncate max-w-[180px] sm:max-w-xs">
                  {activeEvent.societyName}
                </p>
              </div>
            </div>

            {/* Event Selector, PWA & Two Dedicated Symbols: Committee Mode & Admin Mode */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Event Switcher Dropdown */}
              <div className="relative">
                <button
                  id="event-switcher-btn"
                  onClick={() => setShowEventDropdown(!showEventDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300/80 text-xs font-bold text-amber-950 transition active:scale-95 shadow-2xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-orange-600" />
                  <span className="max-w-[100px] sm:max-w-[150px] truncate">
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

              {/* Symbol 1: Committee Mode (QR Scanner) */}
              <button
                id="btn-header-committee-mode"
                onClick={() => {
                  if (authRole === 'committee' || authRole === 'admin') {
                    setCurrentTab('scanner');
                  } else {
                    setStaffLoginTarget('committee');
                    setShowStaffLoginModal(true);
                  }
                }}
                title="Committee Mode (QR Scanner)"
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs ${
                  currentTab === 'scanner'
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white hover:bg-stone-100 text-stone-800 border-stone-300'
                }`}
              >
                <QrCode className={`w-3.5 h-3.5 ${currentTab === 'scanner' ? 'text-orange-400' : 'text-orange-600'}`} />
                <span className="hidden sm:inline">Committee Mode</span>
                <span className="sm:hidden">Committee</span>
              </button>

              {/* Symbol 2: Admin Mode (All writes, delete & full control) */}
              <button
                id="btn-header-admin-mode"
                onClick={() => {
                  if (authRole === 'admin') {
                    setCurrentTab('admin');
                  } else {
                    setStaffLoginTarget('admin');
                    setShowStaffLoginModal(true);
                  }
                }}
                title="Admin Mode (Master Management)"
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs ${
                  currentTab === 'admin'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white hover:bg-stone-100 text-stone-800 border-stone-300'
                }`}
              >
                <ShieldCheck className={`w-3.5 h-3.5 ${currentTab === 'admin' ? 'text-white' : 'text-amber-600'}`} />
                <span className="hidden sm:inline">Admin Mode</span>
                <span className="sm:hidden">Admin</span>
              </button>

              {/* Exit Button when unlocked */}
              {authRole !== 'resident' && (
                <button
                  onClick={handleLockStaff}
                  title="Exit Committee / Admin Mode"
                  className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition flex items-center gap-1 border border-red-200"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="hidden md:inline text-[11px]">Exit</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs — ONLY VISIBLE TO AUTHENTICATED COMMITTEE / ADMIN */}
          {authRole !== 'resident' && (
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
                <QrCode className="w-4 h-4 text-orange-400" />
                <span>Committee Mode (QR Scanner)</span>
              </button>

              <button
                id="tab-admin-panel"
                onClick={() => {
                  if (authRole === 'admin') {
                    setCurrentTab('admin');
                  } else {
                    setStaffLoginTarget('admin');
                    setShowStaffLoginModal(true);
                  }
                }}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  currentTab === 'admin'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                <span>Admin Mode</span>
                {authRole === 'committee' && <Lock className="w-3 h-3 text-stone-400 ml-0.5" />}
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
              if (authRole === 'committee' || authRole === 'admin') {
                setCurrentTab('scanner');
              } else {
                setStaffLoginTarget('committee');
                setShowStaffLoginModal(true);
              }
            }}
            onSwitchToAdmin={() => {
              if (authRole === 'admin') {
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
            onSwitchToAdmin={() => {
              if (authRole === 'admin') {
                setCurrentTab('admin');
              } else {
                setStaffLoginTarget('admin');
                setShowStaffLoginModal(true);
              }
            }}
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
            {authRole !== 'resident' ? (
              <button
                onClick={handleLockStaff}
                className="text-[11px] text-red-600 hover:text-red-700 font-bold underline cursor-pointer"
              >
                Exit {authRole === 'admin' ? 'Admin Mode' : 'Committee Mode'}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => {
                    setStaffLoginTarget('committee');
                    setShowStaffLoginModal(true);
                  }}
                  className="text-stone-500 hover:text-orange-600 font-medium underline cursor-pointer"
                >
                  Committee Mode
                </button>
                <span className="text-stone-300">•</span>
                <button
                  onClick={() => {
                    setStaffLoginTarget('admin');
                    setShowStaffLoginModal(true);
                  }}
                  className="text-stone-500 hover:text-orange-600 font-medium underline cursor-pointer"
                >
                  Admin Mode
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Committee / Admin Mode Login Modal */}
      {showStaffLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  staffLoginTarget === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-stone-900 text-white'
                }`}>
                  {staffLoginTarget === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                </div>
                <h3 className="text-base font-bold text-stone-900">
                  {staffLoginTarget === 'admin' ? 'Admin Mode Login' : 'Committee Mode Login'}
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
                  setStaffLoginTarget('committee');
                  setStaffLoginError('');
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  staffLoginTarget === 'committee'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 text-orange-600" />
                <span>Committee Mode</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStaffLoginTarget('admin');
                  setStaffLoginError('');
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  staffLoginTarget === 'admin'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>Admin Mode</span>
              </button>
            </div>

            <p className="text-xs text-stone-500 mt-3 text-center">
              {staffLoginTarget === 'admin'
                ? 'Master Admin has full rights to remove and delete any data.'
                : 'Committee volunteers have write rights to scan QR passes at the venue gate.'}
            </p>

            <form onSubmit={handleStaffLogin} className="mt-4 space-y-3.5">
              <div>
                <div className="relative">
                  <input
                    type={showPinText ? 'text' : 'password'}
                    value={staffPinInput}
                    onChange={(e) => setStaffPinInput(e.target.value)}
                    placeholder="Enter Password"
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
