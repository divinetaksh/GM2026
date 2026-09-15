import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Upload,
  Volume2,
  VolumeX,
  Users,
  Home,
  RefreshCw,
  QrCode,
  History,
  Trash2,
  UserCheck,
  UserMinus,
  Plus,
  Minus,
  UserPlus,
  UtensilsCrossed,
  Leaf,
} from 'lucide-react';
import { SocietyEvent, ScanVerificationResult, GateCheckInRecord, PassRecord } from '../types';
import { verifyScannedPayload, normalizeHouseNo } from '../utils/qr';
import { sounds } from '../utils/audio';
import { getStoredCheckIns, recordGateCheckIn, clearGateCheckIns, getStoredIssuedPasses } from '../utils/storage';

interface GateScannerProps {
  activeEvent: SocietyEvent;
  allEvents: SocietyEvent[];
  onSwitchToAdmin: () => void;
  issuedPasses?: PassRecord[];
}

export const GateScanner: React.FC<GateScannerProps> = ({
  activeEvent,
  allEvents,
  issuedPasses: initialIssuedPasses,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanVerificationResult | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [checkIns, setCheckIns] = useState<GateCheckInRecord[]>([]);
  const [issuedPasses, setIssuedPasses] = useState<PassRecord[]>(
    () => initialIssuedPasses || getStoredIssuedPasses().filter((p) => p.eventId === activeEvent.id)
  );
  const [manualInput, setManualInput] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Partial admission state
  const [admitCountSelected, setAdmitCountSelected] = useState<number>(1);
  const [admitSuccessInfo, setAdmitSuccessInfo] = useState<{
    house: string;
    resident: string;
    count: number;
    remaining: number;
    totalRegistered: number;
  } | null>(null);

  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isHandlingScanRef = useRef<boolean>(false);

  // Load check-in history and issued passes for this event
  useEffect(() => {
    const list = getStoredCheckIns().filter((c) => c.eventId === activeEvent.id);
    setCheckIns(list);
    const passes = getStoredIssuedPasses().filter((p) => p.eventId === activeEvent.id);
    setIssuedPasses(passes);
  }, [activeEvent.id]);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const startCameraScanner = async () => {
    setCameraError(null);
    setScanResult(null);
    isHandlingScanRef.current = false;

    try {
      if (qrScannerRef.current) {
        try {
          await qrScannerRef.current.stop();
        } catch {}
      }

      const html5QrCode = new Html5Qrcode('qr-reader-container', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      qrScannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: facingMode },
        config,
        (decodedText) => {
          handleDecodedPayload(decodedText);
        },
        () => {
          // Frame parse failure, continue scanning
        }
      );

      setIsScanning(true);
    } catch (err: unknown) {
      console.error('Camera start failed', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCameraError(
        `Unable to access camera (${errorMessage || 'Permission denied'}). You can still scan by uploading a photo of the QR or using manual test.`
      );
      setIsScanning(false);
    }
  };

  const stopCameraScanner = async () => {
    if (qrScannerRef.current && isScanning) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error('Error stopping scanner', err);
      }
    }
    setIsScanning(false);
  };

  const handleDecodedPayload = (rawText: string) => {
    if (isHandlingScanRef.current) return;
    isHandlingScanRef.current = true;

    // Temporarily pause scanner if running
    if (qrScannerRef.current && isScanning) {
      try {
        qrScannerRef.current.pause(true);
      } catch {}
    }

    const currentCheckIns = getStoredCheckIns();
    const result = verifyScannedPayload(rawText, activeEvent, allEvents, currentCheckIns);
    setScanResult(result);
    setAdmitSuccessInfo(null);

    // Audio & vibration feedback
    if (soundEnabled) {
      if (result.status === 'approved') {
        sounds.playWarning(); // prompt gate volunteer to confirm headcount
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([80, 40, 80]);
        }
      } else if (result.status === 'duplicate') {
        sounds.playWarning();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      } else {
        sounds.playError();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([400]);
        }
      }
    }

    if (result.status === 'approved' && result.remaining) {
      // Default stepper count to remaining or 1
      setAdmitCountSelected(Math.min(result.remaining, 1));
    }
  };

  const handleConfirmAdmission = (countToAdmit: number) => {
    if (!scanResult || !scanResult.parsed) return;

    const remainingAvailable = scanResult.remaining ?? scanResult.parsed.memberCount;
    const finalCount = Math.max(1, Math.min(countToAdmit, remainingAvailable));
    const priorEntered = scanResult.alreadyEntered || 0;
    const totalReg = scanResult.totalRegistered || scanResult.parsed.memberCount;
    const newAlreadyEntered = priorEntered + finalCount;
    const newRemaining = Math.max(0, totalReg - newAlreadyEntered);

    const record: GateCheckInRecord = {
      id: `chk-${Date.now()}`,
      eventId: activeEvent.id,
      eventCode: scanResult.parsed.eventCode,
      houseNo: scanResult.parsed.houseNo,
      residentName: scanResult.parsed.residentName,
      memberCount: finalCount,
      foodPreference: scanResult.parsed.foodPreference,
      swaminarayanCount: scanResult.parsed.swaminarayanCount,
      scannedAt: new Date().toISOString(),
      status: 'approved',
      rawPayload: scanResult.rawText,
      totalRegistered: totalReg,
      alreadyEntered: newAlreadyEntered,
      remaining: newRemaining,
      reason: `Admitted ${finalCount} member(s). ${newRemaining} pending outside.`,
    };

    recordGateCheckIn(record);
    setCheckIns((prev) => [record, ...prev]);

    if (soundEnabled) {
      sounds.playSuccess();
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    setAdmitSuccessInfo({
      house: scanResult.parsed.houseNo,
      resident: scanResult.parsed.residentName,
      count: finalCount,
      remaining: newRemaining,
      totalRegistered: totalReg,
    });
  };

  const resetForNextScan = () => {
    setScanResult(null);
    setAdmitSuccessInfo(null);
    isHandlingScanRef.current = false;
    if (qrScannerRef.current && isScanning) {
      try {
        qrScannerRef.current.resume();
      } catch {}
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let scanner = qrScannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode('qr-reader-container', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        qrScannerRef.current = scanner;
      }
      const decodedText = await scanner.scanFile(file, true);
      handleDecodedPayload(decodedText);
    } catch (err) {
      console.error('File scan error', err);
      setScanResult({
        status: 'invalid',
        title: 'NO QR CODE FOUND',
        message: 'Could not detect a valid QR code in the uploaded image. Please ensure image is clear and well lit.',
        rawText: '',
      });
      if (soundEnabled) sounds.playError();
    }
    // reset input
    e.target.value = '';
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    setShowManualModal(false);
    handleDecodedPayload(manualInput.trim());
    setManualInput('');
  };

  // Stats
  const totalAttending = checkIns
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + (c.memberCount || 1), 0);
  const checkedInHousesCount = new Set(
    checkIns.filter((c) => c.status === 'approved').map((c) => normalizeHouseNo(c.houseNo))
  ).size;

  const totalRegisteredPersons = issuedPasses.reduce(
    (sum, p) => sum + (p.memberCount || 1),
    0
  );
  const totalPendingPersons = Math.max(0, totalRegisteredPersons - totalAttending);

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {/* Scanner Control Bar */}
      <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-2xl border border-stone-800 relative overflow-hidden">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-orange-500" />
                Volunteer QR Scanner
              </h2>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              Active Gate: <span className="text-amber-400 font-bold">{activeEvent.name}</span> ({activeEvent.eventCode})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition ${
                soundEnabled
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-stone-800 border-stone-700 text-stone-400'
              }`}
              title={soundEnabled ? 'Mute Audio Chimes' : 'Enable Audio Chimes'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowHistoryModal(true)}
              className="p-2 rounded-xl bg-stone-800 border border-stone-700 text-stone-300 hover:text-white transition flex items-center gap-1 text-xs"
              title="View Gate Check-in Logs"
            >
              <History className="w-4 h-4 text-orange-400" />
              <span className="hidden sm:inline font-bold">{checkedInHousesCount}</span>
            </button>
          </div>
        </div>

        {/* Live Attendance Counter: Admitted, Pending, Total Registered, Houses In */}
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-stone-950/90 p-3 rounded-2xl border border-emerald-900/40 relative overflow-hidden shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                  <Users className="w-3 h-3 text-emerald-400" />
                  Admitted Inside
                </span>
                <span className="text-[9px] font-mono font-bold text-emerald-400/90 bg-emerald-950/80 px-1 py-0.5 rounded">
                  {totalRegisteredPersons > 0 ? Math.round((totalAttending / totalRegisteredPersons) * 100) : 0}%
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 font-mono tracking-tight">
                {totalAttending} <span className="text-[10px] font-sans font-medium text-stone-400">Persons</span>
              </p>
              <div className="mt-2 w-full h-1 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${totalRegisteredPersons > 0 ? Math.min(100, Math.round((totalAttending / totalRegisteredPersons) * 100)) : 0}%`
                  }}
                />
              </div>
            </div>

            <div className="bg-stone-950/90 p-3 rounded-2xl border border-amber-900/40 relative overflow-hidden shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
                  <UserMinus className="w-3 h-3 text-amber-400" />
                  Pending / Left
                </span>
                <span className="text-[9px] font-mono font-bold text-amber-400/90 bg-amber-950/80 px-1 py-0.5 rounded">
                  {totalRegisteredPersons > 0 ? Math.round((totalPendingPersons / totalRegisteredPersons) * 100) : 0}%
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-amber-400 mt-1 font-mono tracking-tight">
                {totalPendingPersons} <span className="text-[10px] font-sans font-medium text-stone-400">Persons</span>
              </p>
              <div className="mt-2 w-full h-1 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${totalRegisteredPersons > 0 ? Math.min(100, Math.round((totalPendingPersons / totalRegisteredPersons) * 100)) : 0}%`
                  }}
                />
              </div>
            </div>

            <div className="bg-stone-950/90 p-3 rounded-2xl border border-stone-800 relative overflow-hidden shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-stone-300 font-bold flex items-center gap-1">
                  <Users className="w-3 h-3 text-stone-400" />
                  Total Registered
                </span>
                <span className="text-[9px] font-mono font-bold text-stone-400 bg-stone-900 px-1 py-0.5 rounded">
                  100%
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-white mt-1 font-mono tracking-tight">
                {totalRegisteredPersons} <span className="text-[10px] font-sans font-medium text-stone-400">Persons</span>
              </p>
              <div className="mt-2 w-full h-1 bg-stone-800 rounded-full overflow-hidden">
                <div className="h-full bg-stone-400 rounded-full w-full" />
              </div>
            </div>

            <div className="bg-stone-950/90 p-3 rounded-2xl border border-orange-900/40 relative overflow-hidden shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-orange-400 font-bold flex items-center gap-1">
                  <Home className="w-3 h-3 text-orange-400" />
                  Houses In
                </span>
                <span className="text-[9px] font-mono font-bold text-orange-400/90 bg-orange-950/80 px-1 py-0.5 rounded">
                  {activeEvent.paidHouses.length > 0 ? Math.round((checkedInHousesCount / activeEvent.paidHouses.length) * 100) : 0}%
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-orange-400 mt-1 font-mono tracking-tight">
                {checkedInHousesCount}{' '}
                <span className="text-[10px] font-sans font-medium text-stone-400">
                  / {activeEvent.paidHouses.length} Flats
                </span>
              </p>
              <div className="mt-2 w-full h-1 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${activeEvent.paidHouses.length > 0 ? Math.min(100, Math.round((checkedInHousesCount / activeEvent.paidHouses.length) * 100)) : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Camera Viewport Container */}
        <div className="mt-4 relative rounded-2xl overflow-hidden bg-black aspect-square flex flex-col items-center justify-center border-2 border-stone-700 shadow-inner">
          <div
            id="qr-reader-container"
            className="w-full h-full object-cover [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
          />

          {!isScanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-950/90 z-10">
              <div className="w-16 h-16 rounded-3xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-3 shadow-lg">
                <Camera className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white">Camera Offline</h3>
              <p className="text-xs text-stone-400 max-w-xs mt-1">
                Tap below to activate device camera for fast gate verification, or upload a photo of the pass QR.
              </p>

              <button
                id="btn-start-camera"
                onClick={startCameraScanner}
                className="mt-4 py-3 px-6 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-sm shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>Start Camera Scanner</span>
              </button>
            </div>
          )}

          {/* Scanner Guide Overlay when camera is live */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
              {/* Target Aiming Box */}
              <div className="w-64 h-64 border-2 border-amber-400 rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {/* Corner accents */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-orange-500 rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-orange-500 rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-orange-500 rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-orange-500 rounded-br-xl" />
                
                {/* Laser scan line animation */}
                <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse top-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-4 text-xs font-semibold text-white bg-black/60 px-3 py-1 rounded-full backdrop-blur-xs">
                Align QR pass inside box
              </p>
            </div>
          )}
        </div>

        {/* Camera Controls */}
        <div className="mt-3 flex items-center justify-between gap-2">
          {isScanning ? (
            <>
              <button
                id="btn-stop-camera"
                onClick={stopCameraScanner}
                className="py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs transition active:scale-95"
              >
                Stop Camera
              </button>
              <button
                onClick={() => {
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                  setTimeout(startCameraScanner, 100);
                }}
                className="py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs flex items-center gap-1.5 transition active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Switch Camera</span>
              </button>
            </>
          ) : (
            <div className="w-full flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2.5 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>Upload QR Image</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => setShowManualModal(true)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <QrCode className="w-3.5 h-3.5 text-orange-400" />
                <span>Enter Code</span>
              </button>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="mt-3 p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-xs text-amber-200">
            {cameraError}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* FULL-SCREEN / HIGH-CONTRAST VERIFICATION OVERLAY (GREEN / RED / AMBER) */}
      {/* ========================================================= */}
      {scanResult && (
        <div
          id="scan-result-overlay"
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 overflow-y-auto ${
            admitSuccessInfo
              ? 'bg-emerald-600/95 backdrop-blur-md'
              : scanResult.status === 'approved'
              ? 'bg-stone-950/90 backdrop-blur-md'
              : scanResult.status === 'duplicate'
              ? 'bg-amber-600/95 backdrop-blur-md'
              : 'bg-red-600/95 backdrop-blur-md'
          }`}
        >
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 text-stone-900 shadow-2xl border-4 border-white/40 text-center animate-scale-up relative my-auto">
            {/* SUCCESS VIEW: Just admitted */}
            {admitSuccessInfo ? (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto shadow-inner">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider font-extrabold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                    Entry Admitted
                  </span>
                  <h2 className="text-2xl font-black text-stone-900 mt-2">
                    House {admitSuccessInfo.house}
                  </h2>
                  <p className="text-xs text-stone-500 font-semibold mt-0.5">
                    {admitSuccessInfo.resident}
                  </p>
                </div>

                <div className="p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-300 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-600">Admitted Just Now:</span>
                    <span className="text-lg font-black text-emerald-700">
                      {admitSuccessInfo.count} Person{admitSuccessInfo.count > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-emerald-200/80 pt-2">
                    <span className="font-bold text-stone-600">Family Members Left / Pending:</span>
                    <span className="text-base font-black text-amber-700">
                      {admitSuccessInfo.remaining} Person{admitSuccessInfo.remaining === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {admitSuccessInfo.remaining === 0 ? (
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-100/60 p-2.5 rounded-xl">
                    🎉 All {admitSuccessInfo.totalRegistered} registered members for House {admitSuccessInfo.house} have now entered!
                  </p>
                ) : (
                  <p className="text-xs font-medium text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    ℹ️ Remaining {admitSuccessInfo.remaining} family member(s) can enter later using the same pass.
                  </p>
                )}

                <button
                  id="btn-scan-next-admitted"
                  onClick={resetForNextScan}
                  autoFocus
                  className="w-full py-3.5 px-6 rounded-2xl text-white font-black text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-98 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>SCAN NEXT PASS</span>
                </button>
              </div>
            ) : scanResult.status === 'approved' && scanResult.parsed ? (
              /* ACTIVE SCAN SELECTION: Choose how many people are entering right now (1, 2, 3...) */
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="text-left">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Valid Pass
                    </span>
                    <h2 className="text-xl font-black text-stone-900 mt-1">
                      House {scanResult.parsed.houseNo}
                    </h2>
                    <p className="text-xs text-stone-500 font-semibold">{scanResult.parsed.residentName}</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                </div>

                {/* Family Headcount Breakdown Matrix */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-stone-400 block">
                      Total Pass
                    </span>
                    <p className="text-lg font-black text-stone-800 mt-0.5">
                      {scanResult.totalRegistered || scanResult.parsed.memberCount}
                    </p>
                  </div>

                  <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                      Inside
                    </span>
                    <p className="text-lg font-black text-emerald-700 mt-0.5">
                      {scanResult.alreadyEntered || 0}
                    </p>
                  </div>

                  <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-300 text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">
                      Pending / Left
                    </span>
                    <p className="text-lg font-black text-amber-800 mt-0.5">
                      {scanResult.remaining ?? scanResult.parsed.memberCount}
                    </p>
                  </div>
                </div>

                {(scanResult.alreadyEntered || 0) > 0 && (
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 font-medium">
                    ⚠️ <strong>{scanResult.alreadyEntered} member(s)</strong> already entered previously.
                    {' '}{scanResult.remaining} member(s) remaining outside.
                  </div>
                )}

                {/* Food / Prasad Dietary Preference Guidance */}
                <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                  scanResult.parsed.foodPreference === 'swaminarayan_jain' || (scanResult.parsed.swaminarayanCount && scanResult.parsed.swaminarayanCount > 0)
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-stone-50 border-stone-200 text-stone-800'
                }`}>
                  <span className="font-bold flex items-center gap-1.5">
                    {scanResult.parsed.foodPreference === 'swaminarayan_jain' || (scanResult.parsed.swaminarayanCount && scanResult.parsed.swaminarayanCount > 0) ? (
                      <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
                    )}
                    Prasad Counter:
                  </span>
                  <span className="font-extrabold text-right">
                    {scanResult.parsed.swaminarayanCount && scanResult.parsed.swaminarayanCount > 0 ? (
                      scanResult.parsed.swaminarayanCount === scanResult.parsed.memberCount ? (
                        <span className="text-emerald-800">All {scanResult.parsed.swaminarayanCount} Swaminarayan / Jain</span>
                      ) : (
                        <span>
                          <span className="text-emerald-800">{scanResult.parsed.swaminarayanCount} Swaminarayan/Jain</span>
                          {' + '}
                          <span className="text-stone-700">{scanResult.parsed.memberCount - scanResult.parsed.swaminarayanCount} Regular</span>
                        </span>
                      )
                    ) : scanResult.parsed.foodPreference === 'swaminarayan_jain' ? (
                      <span className="text-emerald-800">Swaminarayan / Jain (No Onion-Garlic)</span>
                    ) : (
                      <span className="text-stone-700">Regular Pure Veg</span>
                    )}
                  </span>
                </div>

                {/* ADMISSION PROMPT: Choose 1, 2, or 3 persons entering now */}
                <div className="pt-1">
                  <p className="text-xs font-extrabold text-stone-800 mb-2 uppercase tracking-wide">
                    How many family members are entering now?
                  </p>

                  {/* Instant Quick-Select Buttons (1, 2, 3) */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirmAdmission(1)}
                      className="py-3 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md transition active:scale-95 flex flex-col items-center justify-center"
                    >
                      <span>1 Person</span>
                      <span className="text-[10px] opacity-80 font-normal">Admit 1</span>
                    </button>

                    {(scanResult.remaining ?? 1) >= 2 ? (
                      <button
                        type="button"
                        onClick={() => handleConfirmAdmission(2)}
                        className="py-3 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md transition active:scale-95 flex flex-col items-center justify-center"
                      >
                        <span>2 Persons</span>
                        <span className="text-[10px] opacity-80 font-normal">Admit 2</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="py-3 px-2 rounded-xl bg-stone-100 text-stone-300 font-extrabold text-sm cursor-not-allowed flex flex-col items-center justify-center"
                      >
                        <span>2 Persons</span>
                        <span className="text-[10px] font-normal">N/A</span>
                      </button>
                    )}

                    {(scanResult.remaining ?? 1) >= 3 ? (
                      <button
                        type="button"
                        onClick={() => handleConfirmAdmission(3)}
                        className="py-3 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md transition active:scale-95 flex flex-col items-center justify-center"
                      >
                        <span>3 Persons</span>
                        <span className="text-[10px] opacity-80 font-normal">Admit 3</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="py-3 px-2 rounded-xl bg-stone-100 text-stone-300 font-extrabold text-sm cursor-not-allowed flex flex-col items-center justify-center"
                      >
                        <span>3 Persons</span>
                        <span className="text-[10px] font-normal">N/A</span>
                      </button>
                    )}
                  </div>

                  {/* All Remaining Option if remaining > 3 */}
                  {(scanResult.remaining ?? 1) > 3 && (
                    <button
                      type="button"
                      onClick={() => handleConfirmAdmission(scanResult.remaining!)}
                      className="mt-2 w-full py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Admit All Remaining ({scanResult.remaining} Persons)</span>
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={resetForNextScan}
                    className="text-xs font-bold text-stone-400 hover:text-stone-700 p-2"
                  >
                    Cancel / Scan Another
                  </button>
                  <span className="text-[11px] text-stone-400">
                    Pass: {scanResult.parsed.eventCode}
                  </span>
                </div>
              </div>
            ) : scanResult.status === 'duplicate' && scanResult.parsed ? (
              /* DUPLICATE: ALL REGISTERED MEMBERS ALREADY ENTERED */
              <div className="space-y-4">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto shadow-inner">
                  <AlertTriangle className="w-10 h-10" />
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider font-extrabold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
                    All Members Inside
                  </span>
                  <h2 className="text-2xl font-black text-stone-900 mt-2">
                    House {scanResult.parsed.houseNo}
                  </h2>
                  <p className="text-xs text-stone-500 font-semibold mt-0.5">
                    {scanResult.parsed.residentName}
                  </p>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-2xl border-2 border-amber-300 text-xs text-amber-950 font-medium space-y-1">
                  <p className="font-bold text-amber-900">
                    {scanResult.message}
                  </p>
                  <p className="text-[11px] text-stone-600">
                    Total Registered: <strong>{scanResult.totalRegistered}</strong> • Already Checked In: <strong>{scanResult.alreadyEntered}</strong>
                  </p>
                </div>

                <button
                  id="btn-scan-next-duplicate"
                  onClick={resetForNextScan}
                  autoFocus
                  className="w-full py-3.5 px-6 rounded-2xl text-white font-black text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-98 bg-amber-600 hover:bg-amber-700 shadow-amber-600/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>SCAN NEXT PASS</span>
                </button>
              </div>
            ) : (
              /* INVALID / ERROR */
              <div className="space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto shadow-inner">
                  <XCircle className="w-10 h-10" />
                </div>

                <div>
                  <h2 className="text-xl font-black text-red-700 uppercase">
                    {scanResult.title}
                  </h2>
                  <p className="text-xs text-stone-500 font-medium mt-1">
                    {activeEvent.name} Gate Verification
                  </p>
                </div>

                <div className="p-3.5 bg-red-50 rounded-2xl border-2 border-red-300 text-xs font-medium text-red-900 text-left">
                  {scanResult.message}
                </div>

                {scanResult.rawText && (
                  <div className="p-2 bg-stone-100 rounded-lg text-[10px] font-mono text-stone-500 truncate text-left">
                    Raw: {scanResult.rawText}
                  </div>
                )}

                <button
                  id="btn-scan-next-error"
                  onClick={resetForNextScan}
                  autoFocus
                  className="w-full py-3.5 px-6 rounded-2xl text-white font-black text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-98 bg-red-600 hover:bg-red-700 shadow-red-600/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>SCAN NEXT PASS</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Code Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Manual Pass Code Entry</h3>
            <p className="text-xs text-stone-500 mt-1">
              Paste or type raw QR payload format:
              <code className="block mt-1 font-mono text-[10px] bg-stone-100 p-1 rounded text-stone-700">
                {activeEvent.eventCode}|HOUSE:A-101|NAME:Resident Name|MEMBERS:3
              </code>
            </p>
            <form onSubmit={handleManualSubmit} className="mt-4 space-y-3">
              <textarea
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder={`${activeEvent.eventCode}|HOUSE:A-102|NAME:Rahul Patel|MEMBERS:4`}
                rows={3}
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono outline-none focus:border-orange-500"
                required
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-xs font-bold text-white shadow-xs"
                >
                  Verify Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check-In History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-orange-600" />
                  Gate Check-in Logs
                </h3>
                <p className="text-xs text-stone-500">
                  {checkIns.length} total entries recorded for {activeEvent.name}
                </p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-stone-400 hover:text-stone-700 text-xs font-bold px-2 py-1 bg-stone-100 rounded-lg"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {checkIns.length === 0 ? (
                <div className="text-center py-8 text-stone-400 text-xs">
                  No passes scanned yet for this event gate.
                </div>
              ) : (
                checkIns.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">House {c.houseNo}</span>
                        <span className="text-stone-600">• {c.residentName}</span>
                      </div>
                      <span className="text-[11px] text-stone-500 flex items-center gap-1.5 mt-0.5">
                        <span>{c.memberCount} Passes</span>
                        <span>•</span>
                        {c.swaminarayanCount && c.swaminarayanCount > 0 ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                            <Leaf className="w-3 h-3" />
                            {c.swaminarayanCount} Swaminarayan/Jain
                          </span>
                        ) : c.foodPreference === 'swaminarayan_jain' ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                            <Leaf className="w-3 h-3" />
                            Swaminarayan / Jain
                          </span>
                        ) : (
                          <span className="text-stone-500">Regular Veg</span>
                        )}
                        <span>•</span>
                        <span>{new Date(c.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.status === 'approved' ? 'Approved' : 'Duplicate'}
                    </span>
                  </div>
                ))
              )}
            </div>

            {checkIns.length > 0 && (
              <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                <button
                  onClick={() => {
                    if (confirm('Clear gate check-in logs for this event?')) {
                      clearGateCheckIns(activeEvent.id);
                      setCheckIns([]);
                    }
                  }}
                  className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Logs
                </button>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="py-2 px-4 rounded-xl bg-stone-900 text-white font-bold text-xs"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
