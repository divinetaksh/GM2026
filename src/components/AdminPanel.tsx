import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Calendar,
  Plus,
  Save,
  Check,
  Search,
  Upload,
  Download,
  IndianRupee,
  KeyRound,
  Trash2,
  Lock,
  Unlock,
  AlertCircle,
  Copy,
  ChevronDown,
  Share2,
  ExternalLink,
  Ticket,
  QrCode,
  Users,
  Eye,
  X,
  Home,
  UserMinus,
  FileSpreadsheet,
  Database,
  ArrowUpDown,
  RefreshCw,
  UtensilsCrossed,
  Leaf,
  Cloud,
} from 'lucide-react';
import { SocietyEvent, PassRecord, GateCheckInRecord } from '../types';
import { normalizeHouseNo } from '../utils/qr';
import {
  saveStoredEvents,
  setActiveEventId,
  exportSocietyDataBackup,
  importSocietyDataBackup,
  getAdminMasterPin,
  setAdminMasterPin,
  isAuthorizedAdminPin,
  deleteSingleIssuedPass,
  clearIssuedPasses,
  clearGateCheckIns,
  clearAllEventData,
  resetAllSocietyDatabase,
  syncEventsToCloud,
} from '../utils/storage';
import { PassCard } from './PassCard';

interface AdminPanelProps {
  events: SocietyEvent[];
  activeEvent: SocietyEvent;
  onUpdateEvents: (updated: SocietyEvent[], newActiveId?: string) => void;
  issuedPasses: PassRecord[];
  checkIns: GateCheckInRecord[];
  onUpdatePasses?: (passes: PassRecord[]) => void;
  onUpdateCheckIns?: (checkIns: GateCheckInRecord[]) => void;
  onLockAdmin?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  events,
  activeEvent,
  onUpdateEvents,
  issuedPasses,
  checkIns,
  onUpdatePasses,
  onUpdateCheckIns,
  onLockAdmin,
}) => {
  // Admin unlocked state - STRICTLY LOCKED BY DEFAULT
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Committee Master PIN management
  const [showPinModal, setShowPinModal] = useState(false);
  const [newMasterPin, setNewMasterPin] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  // WhatsApp Notice Share modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [noticeCopied, setNoticeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Selected event in editor
  const [selectedEventId, setSelectedEventId] = useState<string>(activeEvent.id);
  const currentEditingEvent = events.find((e) => e.id === selectedEventId) || activeEvent;

  // Editable Form fields
  const [societyName, setSocietyName] = useState(currentEditingEvent.societyName);
  const [eventName, setEventName] = useState(currentEditingEvent.name);
  const [eventCode, setEventCode] = useState(currentEditingEvent.eventCode);
  const [eventPassword, setEventPassword] = useState(currentEditingEvent.eventPassword);
  const [contributionAmount, setContributionAmount] = useState(currentEditingEvent.contributionAmount);
  const [eventDate, setEventDate] = useState(currentEditingEvent.date);
  const [eventVenue, setEventVenue] = useState(currentEditingEvent.venue);

  // Paid houses master list management
  const [paidHousesList, setPaidHousesList] = useState<string[]>(currentEditingEvent.paidHouses);
  const [bulkInputText, setBulkInputText] = useState('');
  const [newSingleHouse, setNewSingleHouse] = useState('');
  const [houseSearchQuery, setHouseSearchQuery] = useState('');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Excel Sheet Import Result Review Modal State
  const [excelImportResult, setExcelImportResult] = useState<{
    fileName: string;
    totalRows: number;
    paidHouses: string[];
    unpaidHouses: { house: string; amount: string | number }[];
  } | null>(null);
  const [excelImportSyncing, setExcelImportSyncing] = useState(false);

  // Issued Passes Audit Search and View Modal
  const [passSearchQuery, setPassSearchQuery] = useState('');
  const [selectedPassForView, setSelectedPassForView] = useState<PassRecord | null>(null);

  // Cloud Firestore Sync state
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudSyncSuccess, setCloudSyncSuccess] = useState(false);

  const handlePushToCloud = async () => {
    try {
      setCloudSyncing(true);
      await syncEventsToCloud(events);
      setCloudSyncSuccess(true);
      setTimeout(() => setCloudSyncSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to sync to cloud', err);
      alert('Failed to sync with cloud. Please check network connectivity.');
    } finally {
      setCloudSyncing(false);
    }
  };

  // Modal for new event creation
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventCode, setNewEventCode] = useState('');
  const [newEventPassword, setNewEventPassword] = useState('');
  const [newEventFee, setNewEventFee] = useState(1500);

  // When switching selected event, update form state
  const handleSelectEvent = (id: string) => {
    setSelectedEventId(id);
    const target = events.find((e) => e.id === id);
    if (target) {
      setSocietyName(target.societyName);
      setEventName(target.name);
      setEventCode(target.eventCode);
      setEventPassword(target.eventPassword);
      setContributionAmount(target.contributionAmount);
      setEventDate(target.date);
      setEventVenue(target.venue);
      setPaidHousesList(target.paidHouses);
      setBulkInputText('');
      setHouseSearchQuery('');
    }
  };

  /**
   * Parses various paste formats:
   * Comma-separated (A-101, A-102), newlines, spaces, or ranges (A-101 to A-105)
   */
  const parsePastedHouses = (text: string): string[] => {
    const tokens = text
      .split(/[\n,\t; ]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const result: string[] = [];

    tokens.forEach((token) => {
      const normalized = normalizeHouseNo(token);
      if (normalized && !result.includes(normalized)) {
        result.push(normalized);
      }
    });

    return result;
  };

  const handleBulkAddHouses = (mode: 'append' | 'replace') => {
    if (!bulkInputText.trim()) return;
    const parsed = parsePastedHouses(bulkInputText);

    if (parsed.length === 0) return;

    let updatedList: string[];
    if (mode === 'replace') {
      updatedList = parsed;
    } else {
      const combined = [...paidHousesList];
      parsed.forEach((h) => {
        if (!combined.includes(h)) combined.push(h);
      });
      updatedList = combined;
    }

    setPaidHousesList(updatedList);
    setBulkInputText('');
  };

  const handleAddSingleHouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSingleHouse.trim()) return;
    const normalized = normalizeHouseNo(newSingleHouse);
    if (!paidHousesList.includes(normalized)) {
      setPaidHousesList([normalized, ...paidHousesList]);
      setNewSingleHouse('');
    }
  };

  const handleRemoveHouse = (houseToRemove: string) => {
    setPaidHousesList(paidHousesList.filter((h) => h !== houseToRemove));
  };

  const handleClearAllHouses = () => {
    if (paidHousesList.length === 0) return;
    if (confirm(`Are you sure you want to clear all ${paidHousesList.length} verified houses for this event? No house will be pre-approved until you add or paste them.`)) {
      setPaidHousesList([]);
    }
  };

  const [quickPaidSyncing, setQuickPaidSyncing] = useState(false);
  const [quickPaidSuccess, setQuickPaidSuccess] = useState(false);

  const handleQuickSavePaidHouses = async () => {
    try {
      setQuickPaidSyncing(true);
      const updatedEvent: SocietyEvent = {
        ...currentEditingEvent,
        paidHouses: paidHousesList,
      };
      const updatedEvents = events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
      saveStoredEvents(updatedEvents);
      onUpdateEvents(updatedEvents);
      await syncEventsToCloud(updatedEvents);
      setQuickPaidSuccess(true);
      setTimeout(() => setQuickPaidSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to sync paid houses to cloud', err);
      alert('Failed to sync to online cloud. Please check network.');
    } finally {
      setQuickPaidSyncing(false);
    }
  };

  const handleSaveChanges = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedEvent: SocietyEvent = {
      ...currentEditingEvent,
      societyName: societyName.trim(),
      name: eventName.trim(),
      eventCode: eventCode.trim().toUpperCase(),
      eventPassword: eventPassword.trim(),
      contributionAmount: Number(contributionAmount) || 0,
      date: eventDate.trim(),
      venue: eventVenue.trim(),
      paidHouses: paidHousesList,
    };

    const updatedEvents = events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
    saveStoredEvents(updatedEvents);
    onUpdateEvents(updatedEvents);

    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3000);
  };

  const handleSetAsActiveEvent = () => {
    setActiveEventId(currentEditingEvent.id);
    onUpdateEvents(events, currentEditingEvent.id);
  };

  const handleCreateNewEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim() || !newEventCode.trim() || !newEventPassword.trim()) return;

    const newId = `evt-${Date.now()}`;
    const brandNew: SocietyEvent = {
      id: newId,
      name: newEventName.trim(),
      eventCode: newEventCode.trim().toUpperCase(),
      societyName: societyName.trim() || 'Taksh Divine',
      eventPassword: newEventPassword.trim(),
      contributionAmount: Number(newEventFee) || 1500,
      date: 'Upcoming Season',
      venue: 'Society Clubhouse',
      paidHouses: [],
      createdAt: new Date().toISOString(),
    };

    const updated = [brandNew, ...events];
    saveStoredEvents(updated);
    setActiveEventId(newId);
    onUpdateEvents(updated, newId);
    setSelectedEventId(newId);
    setShowNewEventModal(false);
    setNewEventName('');
    setNewEventCode('');
    setNewEventPassword('');
  };

  const handleDeleteSinglePass = (pass: PassRecord) => {
    if (confirm(`Are you sure you want to delete the pass for House ${pass.houseNo} (${pass.residentName})? They will be able to generate a fresh pass if needed.`)) {
      deleteSingleIssuedPass(pass.id);
      const remaining = issuedPasses.filter((p) => p.id !== pass.id);
      if (onUpdatePasses) onUpdatePasses(remaining);
    }
  };

  const handleClearCurrentEventPasses = () => {
    if (
      confirm(
        `CLEAR ALL RESIDENT DATA FOR "${currentEditingEvent.name.toUpperCase()}"?\n\n` +
        `This will reset:\n` +
        `• All Generated Resident Passes (${currentEventPasses.length}) to 0\n` +
        `• All Gate Check-In & Admission Scans (${thisEventCheckIns.length}) to 0\n\n` +
        `Both Google Cloud Firestore and local storage will be cleared back to 0.\n` +
        `Your society event settings and verified paid houses list will remain intact.\n\n` +
        `Proceed to reset all passes and gate attendance to 0?`
      )
    ) {
      clearAllEventData(currentEditingEvent.id, currentEditingEvent.eventCode);
      try {
        localStorage.removeItem('society_issued_passes');
      } catch {}
      const remainingPasses = issuedPasses.filter(
        (p) => p.eventId !== currentEditingEvent.id && p.eventCode?.toLowerCase() !== currentEditingEvent.eventCode?.toLowerCase()
      );
      const remainingCheckIns = checkIns.filter(
        (c) => c.eventId !== currentEditingEvent.id && c.eventCode?.toLowerCase() !== currentEditingEvent.eventCode?.toLowerCase()
      );
      if (onUpdatePasses) onUpdatePasses(remainingPasses);
      if (onUpdateCheckIns) onUpdateCheckIns(remainingCheckIns);
      alert(`Cleared all resident passes and gate admission check-ins back to 0!`);
    }
  };

  const handleClearCurrentEventCheckIns = () => {
    const count = thisEventCheckIns.length;
    if (count === 0) {
      alert('There are no gate check-in logs to clear for this event (already 0).');
      return;
    }
    if (confirm(`Reset Gate Attendance Counter to 0?\n\nThis will clear all ${count} gate check-in logs and admission records for "${currentEditingEvent.name}" from both Cloud and Local Storage.`)) {
      clearGateCheckIns(currentEditingEvent.id, currentEditingEvent.eventCode);
      const remaining = checkIns.filter(
        (c) => c.eventId !== currentEditingEvent.id && c.eventCode?.toLowerCase() !== currentEditingEvent.eventCode?.toLowerCase()
      );
      if (onUpdateCheckIns) onUpdateCheckIns(remaining);
      alert(`Gate attendance counter successfully reset to 0.`);
    }
  };

  const handleStartFreshEvent = () => {
    if (confirm(`START FRESH FOR "${currentEditingEvent.name.toUpperCase()}"?\n\nThis will remove:\n• All issued passes for this event (${currentEventPasses.length})\n• All gate check-in logs for this event (${thisEventCheckIns.length})\n\nYour verified paid houses list and event configuration will remain preserved. Continue?`)) {
      clearAllEventData(currentEditingEvent.id);
      const remPasses = issuedPasses.filter((p) => p.eventId !== currentEditingEvent.id);
      const remCheckIns = checkIns.filter((c) => c.eventId !== currentEditingEvent.id);
      if (onUpdatePasses) onUpdatePasses(remPasses);
      if (onUpdateCheckIns) onUpdateCheckIns(remCheckIns);
      alert(`Event "${currentEditingEvent.name}" is now 100% fresh with zero test passes and zero scan logs.`);
    }
  };

  const handleResetEntireDatabase = () => {
    const entered = prompt(`DANGER: To reset the entire app to factory defaults, type "RESET" in capital letters:\n(This clears all custom events, test passes, logs, and restarts fresh)`);
    if (entered === 'RESET') {
      resetAllSocietyDatabase();
      alert('All local database records cleared. Restarting fresh...');
      window.location.reload();
    }
  };

  const handleDeleteEvent = (id: string) => {
    if (events.length <= 1) {
      alert('Cannot delete the last remaining event. Society system requires at least one event.');
      return;
    }
    if (confirm(`Are you sure you want to delete "${currentEditingEvent.name}"?`)) {
      const remaining = events.filter((e) => e.id !== id);
      const nextActiveId = remaining[0].id;
      saveStoredEvents(remaining);
      setActiveEventId(nextActiveId);
      onUpdateEvents(remaining, nextActiveId);
      setSelectedEventId(nextActiveId);
    }
  };

  const handleExportBackup = () => {
    const json = exportSocietyDataBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Society_Pass_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Importing will restore society events, paid houses, passes, and attendance records from this backup file. Continue?')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && importSocietyDataBackup(content)) {
        alert('Society data and paid house lists imported successfully!');
        window.location.reload();
      } else {
        alert('Failed to import backup file. Please verify JSON format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportPaidHousesExcel = () => {
    if (paidHousesList.length === 0) {
      alert('No paid houses found for this event.');
      return;
    }
    const excelRows = paidHousesList.map((h) => ({
      'House Number': h,
      'Event Name': currentEditingEvent.name,
      'Event Code': currentEditingEvent.eventCode,
      'Society Name': currentEditingEvent.societyName,
      'Contribution Amount (INR)': contributionAmount,
    }));
    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 14 }, { wch: 20 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Paid Houses');
    XLSX.writeFile(wb, `${currentEditingEvent.eventCode || 'Taksh_Divine'}_Paid_Houses_Directory.xlsx`);
  };

  const handleExportIssuedPassesExcel = () => {
    if (currentEventPasses.length === 0) {
      alert('No passes have been generated for this event yet.');
      return;
    }
    const excelRows = currentEventPasses.map((p) => {
      const swamiCount = p.swaminarayanCount !== undefined && p.swaminarayanCount > 0
        ? p.swaminarayanCount
        : (p.foodPreference === 'swaminarayan_jain' ? p.memberCount : 0);
      const regCount = Math.max(0, p.memberCount - swamiCount);
      const foodLabel = swamiCount > 0 && regCount > 0
        ? `${swamiCount} Swaminarayan/Jain + ${regCount} Regular`
        : (swamiCount > 0 ? 'Swaminarayan / Jain' : 'Regular Pure Veg');

      const isAdmitted = thisEventCheckIns.some(
        (c) => c.houseNo.toLowerCase() === p.houseNo.toLowerCase()
      );

      return {
        'House Number': p.houseNo,
        'Resident Name': p.residentName,
        'Mobile Number': p.phone || 'N/A',
        'No. of Persons (Guest Count)': p.memberCount,
        'Refreshments / Lunch / Dinner Dietary': foodLabel,
        'Swaminarayan / Jain Count': swamiCount,
        'Regular Pure Veg Count': regCount,
        'Gate Pass Code (PIN)': p.id,
        'Admitted Inside Status': isAdmitted ? 'ADMITTED (INSIDE)' : 'NOT SCANNED',
        'Event Code': p.eventCode,
        'Pass Generated Date & Time': new Date(p.issuedAt).toLocaleString('en-IN'),
        'QR Payload': p.qrPayload,
      };
    });

    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 16 },
      { wch: 24 },
      { wch: 34 },
      { wch: 24 },
      { wch: 22 },
      { wch: 20 },
      { wch: 24 },
      { wch: 14 },
      { wch: 26 },
      { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registered Member Passes');
    XLSX.writeFile(wb, `${currentEditingEvent.eventCode || 'Taksh_Divine'}_Registered_Members_PassCodes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportAttendanceLogExcel = () => {
    if (thisEventCheckIns.length === 0) {
      alert('No check-in records have been scanned for this event yet.');
      return;
    }
    const excelRows = thisEventCheckIns.map((c) => {
      const matchingPass = currentEventPasses.find(
        (p) => p.houseNo.toLowerCase() === c.houseNo.toLowerCase()
      );
      const swamiCount = c.swaminarayanCount !== undefined && c.swaminarayanCount > 0
        ? c.swaminarayanCount
        : (c.foodPreference === 'swaminarayan_jain' ? c.memberCount : 0);
      const regCount = Math.max(0, c.memberCount - swamiCount);
      const foodLabel = c.foodPreference === 'swaminarayan_jain' || swamiCount > 0
        ? 'Swaminarayan / Jain'
        : 'Regular Pure Veg';

      return {
        'House Number': c.houseNo,
        'Resident Name': c.residentName || matchingPass?.residentName || 'Resident',
        'Mobile Number': matchingPass?.phone || 'N/A',
        'Members Admitted': c.memberCount,
        'Refreshments / Lunch / Dinner Dietary': foodLabel,
        'Swaminarayan / Jain Count': swamiCount,
        'Regular Pure Veg Count': regCount,
        'Gate Pass Code (PIN)': matchingPass?.id || 'N/A',
        'Check-In Timestamp': new Date(c.scannedAt).toLocaleString('en-IN'),
        'Status': c.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 32 },
      { wch: 24 },
      { wch: 22 },
      { wch: 20 },
      { wch: 26 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gate Attendance Log');
    XLSX.writeFile(wb, `${currentEditingEvent.eventCode || 'Taksh_Divine'}_Gate_Attendance_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadSampleExcel = () => {
    const sampleData = [
      ['House No', 'Amount'],
      ['101', 1500],
      ['102', 1500],
      ['103', 0],
      ['104', 1500],
      ['105', 500],
      ['106', 1500],
      ['107', 1500],
      ['108', 0],
      ['109', 1500],
      ['110', 1500],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Paid_Houses');
    XLSX.writeFile(wb, `${currentEditingEvent.eventCode || 'Taksh_Divine'}_Paid_House_List_Template.xlsx`);
  };

  const handleImportHousesFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          alert('Spreadsheet has no sheets.');
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rows || rows.length === 0) {
          alert('Uploaded Excel / CSV spreadsheet is empty.');
          return;
        }

        const paidList: string[] = [];
        const unpaidList: { house: string; amount: string | number }[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const rawHouse = row[0];
          const rawAmount = row[1];

          if (rawHouse === undefined || rawHouse === null) continue;
          const houseStr = String(rawHouse).trim();
          if (!houseStr) continue;

          // Check if header row
          const lower = houseStr.toLowerCase();
          if (
            lower === 'house no' ||
            lower === 'house' ||
            lower === 'house_no' ||
            lower === 'houseno' ||
            lower === 'flat' ||
            lower === 'flat no' ||
            lower === 'flat number' ||
            lower === 'unit' ||
            lower === 'unit no' ||
            lower === 'flat / house'
          ) {
            continue;
          }

          const normalized = normalizeHouseNo(houseStr);

          // User Rule: Two columns. Col 1 = House No, Col 2 = Amount.
          // If amount is 1500, consider as paid. Otherwise not paid.
          if (rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '') {
            const cleanAmountStr = String(rawAmount).replace(/[₹,$\s]/g, '').trim();
            const parsedAmount = parseFloat(cleanAmountStr);

            const isPaid =
              parsedAmount === 1500 ||
              (!isNaN(parsedAmount) && parsedAmount === Number(currentEditingEvent.contributionAmount));

            if (isPaid) {
              paidList.push(normalized);
            } else {
              unpaidList.push({
                house: normalized,
                amount: rawAmount,
              });
            }
          } else {
            // No amount specified -> Unpaid
            unpaidList.push({
              house: normalized,
              amount: '0 (Unpaid / Blank)',
            });
          }
        }

        const uniquePaid = Array.from(new Set(paidList));

        if (uniquePaid.length === 0 && unpaidList.length === 0) {
          alert('Could not detect any valid house records in the spreadsheet.');
          return;
        }

        setExcelImportResult({
          fileName: file.name,
          totalRows: rows.length,
          paidHouses: uniquePaid,
          unpaidHouses: unpaidList,
        });
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        alert('Failed to parse spreadsheet. Please ensure it is a valid .xlsx, .xls, or .csv file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleApplyExcelImport = async (mode: 'replace' | 'append') => {
    if (!excelImportResult) return;
    try {
      setExcelImportSyncing(true);
      const importedPaid = excelImportResult.paidHouses;
      let finalHouses: string[] = [];
      if (mode === 'replace') {
        finalHouses = Array.from(new Set(importedPaid));
      } else {
        finalHouses = Array.from(new Set([...paidHousesList, ...importedPaid]));
      }
      setPaidHousesList(finalHouses);

      const updatedEvent: SocietyEvent = {
        ...currentEditingEvent,
        paidHouses: finalHouses,
      };
      const updatedEvents = events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
      saveStoredEvents(updatedEvents);
      onUpdateEvents(updatedEvents);
      await syncEventsToCloud(updatedEvents);

      alert(`✅ Updated list with ${importedPaid.length} verified paid houses (Amount: ₹1,500) and synced to Firebase Cloud!`);
      setExcelImportResult(null);
    } catch (err) {
      console.error('Failed to sync imported houses to cloud:', err);
      alert('Saved locally, but failed to sync to cloud. Please check network connection.');
    } finally {
      setExcelImportSyncing(false);
    }
  };

  const filteredHouses = paidHousesList.filter((h) =>
    h.toLowerCase().includes(houseSearchQuery.toLowerCase())
  );

  const currentEventPasses = issuedPasses.filter(
    (p) => p.eventId === currentEditingEvent.id
  );
  const totalRegisteredMembers = currentEventPasses.reduce(
    (sum, p) => sum + (p.memberCount || 1),
    0
  );
  const filteredPasses = currentEventPasses.filter((p) => {
    if (!passSearchQuery.trim()) return true;
    const q = passSearchQuery.toLowerCase();
    return (
      p.houseNo.toLowerCase().includes(q) ||
      p.residentName.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q))
    );
  });

  // Statistics & Real-time 4-metric Attendance Counter for selected event
  const thisEventIssuedPasses = issuedPasses.filter((p) => p.eventId === currentEditingEvent.id);
  const totalRegisteredPersons = thisEventIssuedPasses.reduce((sum, p) => sum + (p.memberCount || 1), 0);
  const thisEventCheckIns = checkIns.filter(
    (c) => c.eventId === currentEditingEvent.id && c.status === 'approved'
  );
  const totalAdmittedPersons = thisEventCheckIns.reduce((sum, c) => sum + (c.memberCount || 1), 0);
  const totalPendingPersons = Math.max(0, totalRegisteredPersons - totalAdmittedPersons);
  const checkedInHousesCount = new Set(
    thisEventCheckIns.map((c) => normalizeHouseNo(c.houseNo))
  ).size;
  const admittedFlats = checkedInHousesCount;
  const totalAdmittedMembers = totalAdmittedPersons;

  // Catering & Food Dietary Metrics
  const totalSwamiMealsRegistered = thisEventIssuedPasses.reduce((sum, p) => {
    if (p.swaminarayanCount !== undefined && p.swaminarayanCount > 0) return sum + p.swaminarayanCount;
    return p.foodPreference === 'swaminarayan_jain' ? sum + (p.memberCount || 1) : sum;
  }, 0);
  const totalRegularMealsRegistered = Math.max(0, totalRegisteredPersons - totalSwamiMealsRegistered);

  const totalSwamiMealsAdmitted = thisEventCheckIns.reduce((sum, c) => {
    if (c.swaminarayanCount !== undefined && c.swaminarayanCount > 0) return sum + c.swaminarayanCount;
    return c.foodPreference === 'swaminarayan_jain' ? sum + (c.memberCount || 1) : sum;
  }, 0);
  const totalRegularMealsAdmitted = Math.max(0, totalAdmittedPersons - totalSwamiMealsAdmitted);

  if (!isAdminUnlocked) {
    return (
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl p-8 shadow-xl border border-stone-200 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-800 mx-auto mb-4">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-stone-900">Admin Mode Lock</h2>
        <p className="text-xs text-stone-500 mt-1">
          This panel has full administrator rights to remove and delete data. Enter Admin password to continue.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isAuthorizedAdminPin(adminPinInput.trim())) {
              setIsAdminUnlocked(true);
              setPinError('');
            } else {
              setPinError('Incorrect password. Access denied.');
            }
          }}
          className="mt-6 space-y-4"
        >
          <input
            type="password"
            value={adminPinInput}
            onChange={(e) => setAdminPinInput(e.target.value)}
            placeholder="Enter Admin Password"
            className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 text-center text-lg tracking-widest font-mono font-bold"
            autoFocus
          />

          {pinError && <p className="text-xs text-red-600 font-semibold">{pinError}</p>}

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition"
          >
            <Unlock className="w-4 h-4" />
            <span>Unlock Committee Admin</span>
          </button>
        </form>
      </div>
    );
  }

  // Generate WhatsApp Notice text
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const residentDirectLink = `${baseUrl}?event=${currentEditingEvent.eventCode}&role=resident`;
  const volunteerScannerLink = `${baseUrl}?mode=scanner`;

  const whatsappNoticeText = `🎉 *${currentEditingEvent.societyName.toUpperCase()}* 🎉
*Official Digital Pass — ${currentEditingEvent.name}*

Dear Residents,

Passes for ${currentEditingEvent.name} are now available! Please verify your house number and download your family pass before the event.

👉 *Get Your Pass Here:*
${residentDirectLink}

🔐 *Event Access Password:* ${currentEditingEvent.eventPassword}

📋 *Steps:*
1. Click the link above.
2. Enter your House Number (e.g. A-102) & family member count.
3. Select your dinner preference (Regular Pure Veg or Swaminarayan / Jain).
4. Tap "Download Pass Image" to save your pass in your phone gallery.

Show this QR pass at the entrance gate for instant entry!
— Festival Managing Committee`;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Top Banner & Event Switcher */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-amber-200/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-orange-100 text-orange-700">
                <Settings2 className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black text-stone-900 tracking-tight">
                Admin Configuration Panel
              </h2>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Configure event credentials, contribution amount, and master array of paid houses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('section-import-export');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="py-2 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
              <span>Import / Export</span>
            </button>
            <button
              onClick={() => setShowShareModal(true)}
              className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Notice</span>
            </button>
            <button
              onClick={() => setShowNewEventModal(true)}
              className="py-2 px-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold text-xs shadow-xs flex items-center gap-1 transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Event</span>
            </button>
            <button
              onClick={() => setShowPinModal(true)}
              title="Change Committee Master PIN"
              className="p-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition text-xs flex items-center gap-1 font-medium"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">PIN</span>
            </button>
            <button
              onClick={() => {
                setIsAdminUnlocked(false);
                setAdminPinInput('');
                if (onLockAdmin) onLockAdmin();
              }}
              title="Lock Admin Panel"
              className="p-2 rounded-xl border border-stone-200 text-red-600 hover:bg-red-50 transition text-xs flex items-center gap-1 font-medium"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>

        {/* Switch Between Events Tabs */}
        <div className="mt-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
            Select Society Event to Manage or Switch:
          </label>
          <div className="flex flex-wrap gap-2">
            {events.map((evt) => {
              const isSelected = evt.id === currentEditingEvent.id;
              const isActiveGate = evt.id === activeEvent.id;

              return (
                <button
                  key={evt.id}
                  onClick={() => handleSelectEvent(evt.id)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-orange-600 text-white border-orange-600 shadow-md'
                      : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-orange-50 hover:text-orange-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{evt.name}</span>
                  {isActiveGate && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase ${
                        isSelected
                          ? 'bg-amber-400 text-stone-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      Active Gate
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Set as Active Gate Banner if viewing inactive event */}
        {currentEditingEvent.id !== activeEvent.id && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900">
            <div>
              <strong>Note:</strong> Currently editing "{currentEditingEvent.name}". Gate Scanner &amp; Pass Portal are active for "{activeEvent.name}".
            </div>
            <button
              onClick={handleSetAsActiveEvent}
              className="py-1.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shrink-0 transition"
            >
              Set as Active Gate
            </button>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* REAL-TIME 4-METRIC ATTENDANCE COUNTER (Matches QR Scanner) */}
      {/* ========================================================= */}
      <div className="bg-stone-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider">
              Real-Time Gate Attendance &amp; Admission Metrics — {currentEditingEvent.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportIssuedPassesExcel}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer"
              title="Export all registered members, gate passes, passcodes and mobile numbers in Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Member Passes &amp; PassCodes (.xlsx)</span>
            </button>
            {totalAdmittedPersons > 0 && (
              <button
                type="button"
                onClick={handleClearCurrentEventCheckIns}
                className="px-2.5 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                title="Reset gate admission count and checked-in logs back to 0"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
                <span>Reset Gate to 0</span>
              </button>
            )}
            <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-stone-800 border border-stone-700 text-stone-300 font-bold uppercase tracking-wider">
              Live Sync Active
            </span>
          </div>
        </div>

        {/* 4 Professional KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Metric 1: Admitted Inside */}
          <div className="bg-stone-950/90 p-4 rounded-2xl border border-emerald-900/40 relative overflow-hidden group hover:border-emerald-500/50 transition shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                Admitted Inside
              </span>
              <span className="text-[10px] font-mono font-bold text-emerald-500/80 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-900/60">
                {totalRegisteredPersons > 0 ? Math.round((totalAdmittedPersons / totalRegisteredPersons) * 100) : 0}%
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2 font-mono tracking-tight">
              {totalAdmittedPersons}
              <span className="text-xs font-sans font-medium text-stone-400 ml-1">Persons</span>
            </p>
            {/* Visual Mini Progress Bar */}
            <div className="mt-3 w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                style={{
                  width: `${totalRegisteredPersons > 0 ? Math.min(100, Math.round((totalAdmittedPersons / totalRegisteredPersons) * 100)) : 0}%`
                }}
              />
            </div>
          </div>

          {/* Metric 2: Pending / Left */}
          <div className="bg-stone-950/90 p-4 rounded-2xl border border-amber-900/40 relative overflow-hidden group hover:border-amber-500/50 transition shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                <UserMinus className="w-3.5 h-3.5 text-amber-400" />
                Pending / Left
              </span>
              <span className="text-[10px] font-mono font-bold text-amber-500/80 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-900/60">
                {totalRegisteredPersons > 0 ? Math.round((totalPendingPersons / totalRegisteredPersons) * 100) : 0}%
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-400 mt-2 font-mono tracking-tight">
              {totalPendingPersons}
              <span className="text-xs font-sans font-medium text-stone-400 ml-1">Persons</span>
            </p>
            {/* Visual Mini Progress Bar */}
            <div className="mt-3 w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-500"
                style={{
                  width: `${totalRegisteredPersons > 0 ? Math.min(100, Math.round((totalPendingPersons / totalRegisteredPersons) * 100)) : 0}%`
                }}
              />
            </div>
          </div>

          {/* Metric 3: Total Registered */}
          <div className="bg-stone-950/90 p-4 rounded-2xl border border-stone-800 relative overflow-hidden group hover:border-stone-700 transition shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-stone-300 font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-stone-400" />
                Total Registered
              </span>
              <span className="text-[10px] font-mono font-bold text-stone-400 bg-stone-900 px-1.5 py-0.5 rounded border border-stone-800">
                100%
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-white mt-2 font-mono tracking-tight">
              {totalRegisteredPersons}
              <span className="text-xs font-sans font-medium text-stone-400 ml-1">Persons</span>
            </p>
            <div className="mt-3 w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
              <div className="h-full bg-stone-400 rounded-full w-full" />
            </div>
          </div>

          {/* Metric 4: Houses In */}
          <div className="bg-stone-950/90 p-4 rounded-2xl border border-orange-900/40 relative overflow-hidden group hover:border-orange-500/50 transition shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-orange-400 font-bold flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-orange-400" />
                Houses In
              </span>
              <span className="text-[10px] font-mono font-bold text-orange-500/80 bg-orange-950/60 px-1.5 py-0.5 rounded border border-orange-900/60">
                {paidHousesList.length > 0 ? Math.round((checkedInHousesCount / paidHousesList.length) * 100) : 0}%
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-orange-400 mt-2 font-mono tracking-tight">
              {checkedInHousesCount}
              <span className="text-xs font-sans font-medium text-stone-400 ml-1">
                / {paidHousesList.length} Flats
              </span>
            </p>
            <div className="mt-3 w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
                style={{
                  width: `${paidHousesList.length > 0 ? Math.min(100, Math.round((checkedInHousesCount / paidHousesList.length) * 100)) : 0}%`
                }}
              />
            </div>
          </div>
        </div>

        {/* Real-time Visual Ratio Strip */}
        <div className="bg-stone-950/60 p-3 rounded-2xl border border-stone-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-stone-400 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Admitted: <strong className="text-white font-mono">{totalAdmittedPersons}</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <span>Pending: <strong className="text-white font-mono">{totalPendingPersons}</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
              <span>Society Houses: <strong className="text-white font-mono">{checkedInHousesCount}/{paidHousesList.length}</strong></span>
            </span>
          </div>

          <div className="w-full sm:w-64 flex h-2 rounded-full overflow-hidden bg-stone-800 shrink-0">
            <div
              style={{ width: `${totalRegisteredPersons > 0 ? (totalAdmittedPersons / totalRegisteredPersons) * 100 : 0}%` }}
              className="bg-emerald-500 h-full transition-all duration-300"
              title="Admitted"
            />
            <div
              style={{ width: `${totalRegisteredPersons > 0 ? (totalPendingPersons / totalRegisteredPersons) * 100 : 0}%` }}
              className="bg-amber-500 h-full transition-all duration-300"
              title="Pending"
            />
          </div>
        </div>

        {/* Catering & Food Committee Breakdown Card */}
        <div className="bg-stone-950/90 rounded-2xl p-4 border border-stone-800/90 space-y-3 shadow-inner">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
              Catering &amp; Dinner Prasad Headcount (Kitchen Committee)
            </span>
            <span className="text-[10px] font-bold text-stone-400 font-mono">
              Live Headcount
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Swaminarayan / Jain Meals */}
            <div className="bg-stone-900/90 p-3 rounded-xl border border-emerald-900/50 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                  <Leaf className="w-3 h-3 text-emerald-400" />
                  Swaminarayan / Jain (No Onion &amp; Garlic)
                </span>
                <p className="text-xl font-black text-emerald-300 font-mono mt-0.5">
                  {totalSwamiMealsRegistered}
                  <span className="text-xs font-sans font-normal text-stone-400 ml-1">Meals Registered</span>
                </p>
              </div>
              <div className="text-right text-[11px] font-mono">
                <span className="block text-emerald-400 font-bold">{totalSwamiMealsAdmitted} Admitted / In</span>
                <span className="block text-amber-400 font-semibold">{Math.max(0, totalSwamiMealsRegistered - totalSwamiMealsAdmitted)} Pending</span>
              </div>
            </div>

            {/* Regular Pure Veg Meals */}
            <div className="bg-stone-900/90 p-3 rounded-xl border border-orange-900/50 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-orange-400 flex items-center gap-1">
                  <UtensilsCrossed className="w-3 h-3 text-orange-400" />
                  Regular Pure Veg (Standard)
                </span>
                <p className="text-xl font-black text-orange-300 font-mono mt-0.5">
                  {totalRegularMealsRegistered}
                  <span className="text-xs font-sans font-normal text-stone-400 ml-1">Meals Registered</span>
                </p>
              </div>
              <div className="text-right text-[11px] font-mono">
                <span className="block text-emerald-400 font-bold">{totalRegularMealsAdmitted} Admitted / In</span>
                <span className="block text-amber-400 font-semibold">{Math.max(0, totalRegularMealsRegistered - totalRegularMealsAdmitted)} Pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Event Overview & Parameters */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
            Pre-Approved Paid Houses
          </span>
          <p className="text-xl font-black text-orange-600 mt-0.5">
            {paidHousesList.length} <span className="text-xs font-semibold text-stone-500">Flats</span>
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
            Contribution Fee
          </span>
          <p className="text-xl font-black text-stone-800 mt-0.5">
            ₹{contributionAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
            Passes Issued
          </span>
          <p className="text-xl font-black text-amber-600 mt-0.5">
            {thisEventIssuedPasses.length} <span className="text-xs font-semibold text-stone-500">Passes</span>
          </p>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSaveChanges} className="space-y-6">
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-stone-200 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h3 className="text-base font-bold text-stone-900">
              1. Event Credentials &amp; Basic Parameters
            </h3>
            <span className="text-xs font-mono text-stone-400">ID: {currentEditingEvent.id}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Society Name
              </label>
              <input
                type="text"
                value={societyName}
                onChange={(e) => setSocietyName(e.target.value)}
                placeholder="e.g. Taksh Divine"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm font-semibold focus:border-orange-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Event Title
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Ganesh Mahotsav 2026"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm font-semibold focus:border-orange-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Event Short Code (For QR Payload)
              </label>
              <input
                type="text"
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value)}
                placeholder="e.g. GM2026"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm font-mono font-bold uppercase focus:border-orange-500 outline-none"
                required
              />
              <p className="text-[10px] text-stone-400 mt-0.5">
                Prefix used in QR codes: <code>{eventCode}|HOUSE:...</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1 flex items-center justify-between">
                <span>Event Access Password</span>
                <span className="text-[11px] text-orange-600 font-normal">Shared with residents</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={eventPassword}
                  onChange={(e) => setEventPassword(e.target.value)}
                  placeholder="e.g. Ganesh@2026"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-amber-300 bg-amber-50/40 text-sm font-mono font-bold text-orange-950 focus:border-orange-500 outline-none"
                  required
                />
                <KeyRound className="w-4 h-4 text-orange-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Fixed Contribution Amount (₹)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(Number(e.target.value))}
                  placeholder="1500"
                  min={0}
                  className="w-full px-3.5 py-2.5 pl-8 rounded-xl border border-stone-300 text-sm font-bold focus:border-orange-500 outline-none"
                  required
                />
                <IndianRupee className="w-4 h-4 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Event Date / Timing
              </label>
              <input
                type="text"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                placeholder="e.g. 19 Sep – 28 Sep 2026"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:border-orange-500 outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Event Venue Location
              </label>
              <input
                type="text"
                value={eventVenue}
                onChange={(e) => setEventVenue(e.target.value)}
                placeholder="e.g. Clubhouse Lawn & Main Pandal"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:border-orange-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* 2. Master Array of Paid House Numbers */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-stone-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-bold text-stone-900">
                2. Master Array of Paid House Numbers
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Pass generator strictly verifies resident house numbers against this online approved array. Update and sync to cloud in real-time.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1.5 rounded-full ${
                paidHousesList.length === 0 ? 'bg-stone-100 text-stone-600' : 'bg-orange-100 text-orange-900'
              }`}>
                {paidHousesList.length} Verified Houses
              </span>
              <button
                type="button"
                onClick={handleQuickSavePaidHouses}
                disabled={quickPaidSyncing}
                className="py-1.5 px-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-2xs cursor-pointer"
                title="Save verified houses list and sync to Firebase Cloud"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{quickPaidSyncing ? 'Syncing...' : quickPaidSuccess ? 'Saved Online!' : 'Save & Sync Online'}</span>
              </button>
            </div>
          </div>

          {/* Bulk Paste / Input Section */}
          <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/70 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-800">
                Input / Paste Master Array of Paid House Numbers
              </label>
              <span className="text-[11px] font-medium text-stone-500">
                Syncs online to Firebase
              </span>
            </div>
            <textarea
              value={bulkInputText}
              onChange={(e) => setBulkInputText(e.target.value)}
              placeholder="Paste house numbers (1 to 259) in any format:&#10;1, 2, 5, 101, 102, 103, 104, 201, 259&#10;or copy-pasted directly from Excel column"
              rows={3}
              className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono outline-none focus:border-orange-500 focus:bg-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleBulkAddHouses('append')}
                className="py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs transition"
              >
                + Append New House No.
              </button>
              <button
                type="button"
                onClick={() => handleBulkAddHouses('replace')}
                className="py-2 px-3 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-semibold text-xs transition"
              >
                Replace Entire List
              </button>
              <label className="py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-2xs">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
                <span>Import Excel Sheet (.xlsx / .csv)</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleImportHousesFile}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={handleDownloadSampleExcel}
                className="py-2 px-3 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 font-semibold text-xs flex items-center gap-1.5 transition shadow-2xs"
                title="Download 2-Column Excel Template: House No and Amount"
              >
                <Download className="w-3.5 h-3.5 text-stone-500" />
                <span>Download Excel Template</span>
              </button>
              {paidHousesList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllHouses}
                  className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold text-xs flex items-center gap-1 transition"
                  title="Clear all houses from this list"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Clear All Houses</span>
                </button>
              )}
            </div>
          </div>

          {/* Add Single House & Search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1">
                Add Single House No. (1 to 259)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSingleHouse}
                  onChange={(e) => setNewSingleHouse(e.target.value)}
                  placeholder="e.g. 102"
                  className="flex-1 px-3 py-2 rounded-xl border border-stone-300 text-xs font-bold uppercase focus:border-orange-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddSingleHouse}
                  className="py-2 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs"
                >
                  + Add House No.
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1">
                Search Paid Houses
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={houseSearchQuery}
                  onChange={(e) => setHouseSearchQuery(e.target.value)}
                  placeholder="Filter house numbers (e.g. 10, 102)"
                  className="w-full px-3 py-2 pl-8 rounded-xl border border-stone-300 text-xs focus:border-orange-500 outline-none"
                />
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Paid Houses Badges List */}
          <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 max-h-56 overflow-y-auto">
            {filteredHouses.length === 0 ? (
              <div className="text-center py-6 px-4 space-y-1">
                <p className="text-xs font-bold text-stone-700">
                  {paidHousesList.length === 0
                    ? 'No pre-approved houses in this list'
                    : 'No matching house numbers found'}
                </p>
                <p className="text-[11px] text-stone-500 max-w-md mx-auto">
                  {paidHousesList.length === 0
                    ? 'The pre-verified list is empty. Type or paste paid house numbers above and click "Save & Sync Online" to allow residents to generate passes.'
                    : 'Try searching with a different house number.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filteredHouses.map((house) => (
                  <span
                    key={house}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-stone-300 text-xs font-bold text-stone-800 shadow-2xs group"
                  >
                    <span>{house}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveHouse(house)}
                      className="text-stone-300 hover:text-red-600 transition"
                      title={`Remove ${house}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. ISSUED & GENERATED PASSES AUDIT */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-stone-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-orange-600" />
                3. Issued &amp; Generated Passes ({currentEventPasses.length})
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Master audit list of all passes created for {currentEditingEvent.name}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-orange-800 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-xl">
                {totalRegisteredMembers} Total Members Registered
              </span>
              <button
                type="button"
                onClick={handleExportIssuedPassesExcel}
                className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Member Passes (.xlsx)</span>
              </button>
              <button
                id="btn-clear-resident-data"
                type="button"
                onClick={handleClearCurrentEventPasses}
                className="py-1.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-2xs"
                title="Reset all generated passes and gate check-in admissions back to 0 for this event"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>Clear All Passes &amp; Gate Scans</span>
              </button>
            </div>
          </div>

          {/* Search bar for generated passes */}
          <div className="relative">
            <input
              type="text"
              value={passSearchQuery}
              onChange={(e) => setPassSearchQuery(e.target.value)}
              placeholder="Search issued passes by House Number or Resident Name..."
              className="w-full px-3 py-2 pl-8 rounded-xl border border-stone-300 text-xs focus:border-orange-500 outline-none"
            />
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* Passes List */}
          {filteredPasses.length === 0 ? (
            <div className="text-center py-8 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
              <Ticket className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-stone-600">No generated passes found</p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Passes will appear here automatically when residents generate them in the Resident Pass tab.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100 max-h-72 overflow-y-auto rounded-2xl border border-stone-200">
              {filteredPasses.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-white hover:bg-orange-50/50 flex items-center justify-between transition gap-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-orange-100 text-orange-800 font-black text-sm flex items-center justify-center shrink-0 border border-orange-200 shadow-2xs">
                      {p.houseNo}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-stone-900">{p.residentName}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          {p.memberCount} Members
                        </span>
                        {p.swaminarayanCount && p.swaminarayanCount > 0 ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                            <Leaf className="w-2.5 h-2.5" />
                            {p.swaminarayanCount} Swaminarayan/Jain
                          </span>
                        ) : p.foodPreference === 'swaminarayan_jain' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                            <Leaf className="w-2.5 h-2.5" />
                            Swaminarayan / Jain
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                            Regular Veg
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        Generated {new Date(p.issuedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        {p.phone ? ` • Tel: ${p.phone}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedPassForView(p)}
                      className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                    >
                      <QrCode className="w-3.5 h-3.5 text-orange-400" />
                      <span>View Pass</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSinglePass(p)}
                      title={`Delete pass for House ${p.houseNo}`}
                      className="p-1.5 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Data Backup & Import / Export Facility */}
        <div
          id="section-import-export"
          className="bg-white rounded-3xl p-6 shadow-xl border border-stone-200 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-teal-100 text-teal-800">
                  <Database className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-stone-900">
                  4. Data Backup &amp; Import / Export Facility
                </h3>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Download society backups, migrate records between phones/laptops, or export CSV spreadsheets for Excel &amp; WhatsApp.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-teal-50 text-teal-800 rounded-full border border-teal-200">
              Offline Data Ready
            </span>
          </div>

          {/* Cloud Firestore Online Database Card */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-orange-600 text-white shadow-xs">
                  <Cloud className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black uppercase text-stone-900 tracking-tight">
                      Google Firebase Cloud Database
                    </h4>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live &amp; Online
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Project: <code className="font-mono font-bold text-amber-950">absolute-logic-vxjsq</code> &bull; Verified paid member houses, event details, and digital passes sync automatically across all resident phones in real-time.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePushToCloud}
                  disabled={cloudSyncing}
                  className="py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                  <span>{cloudSyncing ? 'Syncing...' : cloudSyncSuccess ? 'Synced to Cloud!' : 'Force Sync to Cloud'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* JSON Full System Backup Card */}
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-stone-200 text-stone-800">
                    <Database className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-stone-800">
                      Full Society Backup (JSON)
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      Includes all events, master paid house arrays, issued passes, and live gate attendance logs.
                    </p>
                  </div>
                </div>

                <p className="text-[10px] text-stone-500 bg-white p-2.5 rounded-xl border border-stone-200 leading-relaxed">
                  💡 <strong>Migration / Offline sync:</strong> Export this JSON file and send it via WhatsApp or email to any committee member or gate scanner phone to instantly import and sync everything.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full sm:flex-1 py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Export Backup (.JSON)</span>
                </button>

                <label className="w-full sm:flex-1 py-2.5 px-3 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-stone-500" />
                  <span>Import Backup (.JSON)</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* CSV / Excel Reports Card */}
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                    <FileSpreadsheet className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-stone-800">
                      Spreadsheet Reports (CSV / Excel)
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      Export individual event tables for Excel, printing, or committee review.
                    </p>
                  </div>
                </div>

                <p className="text-[10px] text-stone-500 bg-white p-2.5 rounded-xl border border-stone-200 leading-relaxed">
                  📊 Open these CSV files in Microsoft Excel or Google Sheets for accounting and security audits.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportIssuedPassesExcel}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-between transition active:scale-95 shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-white" />
                    <span>Export Registered Members, Passes &amp; Mobile Numbers</span>
                  </span>
                  <span className="text-[10px] uppercase font-extrabold bg-white/20 px-2 py-0.5 rounded-md text-white">XLSX</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportAttendanceLogExcel}
                  className="w-full py-2 px-3 rounded-xl bg-white border border-stone-300 hover:border-emerald-500 text-stone-700 font-semibold text-xs flex items-center justify-between transition hover:bg-emerald-50/50 shadow-2xs"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Gate Attendance &amp; Check-In Log ({thisEventCheckIns.length} admissions)</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">XLSX</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPaidHousesExcel}
                  className="w-full py-2 px-3 rounded-xl bg-white border border-stone-300 hover:border-emerald-500 text-stone-700 font-semibold text-xs flex items-center justify-between transition hover:bg-emerald-50/50 shadow-2xs"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-stone-600" />
                    <span>Paid Houses Directory ({paidHousesList.length} houses)</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">XLSX</span>
                </button>
              </div>
            </div>
          </div>

          {/* Clean Slate & Reset Tools for New Events */}
          <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-stone-50/60 p-4 rounded-2xl border border-stone-200/80">
            <div>
              <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>Event Data Management &amp; Clean Slate</span>
              </h4>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Reset all test passes and gate admission scans back to 0 across both Cloud and local cache.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleClearCurrentEventPasses}
                className="flex-1 sm:flex-initial py-2 px-3.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-2xs"
                title="Reset all generated passes and gate check-in admissions back to 0"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>Clear All Passes &amp; Gate Scans</span>
              </button>
              <button
                type="button"
                onClick={handleStartFreshEvent}
                className="flex-1 sm:flex-initial py-2 px-3.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-2xs"
                title="Start 100% fresh with zero passes and zero admissions while keeping society setup"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Start Fresh Event</span>
              </button>
            </div>
          </div>
        </div>

        {/* Save & Danger Zone Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              id="btn-save-event-config"
              type="submit"
              className="w-full sm:w-auto py-3 px-6 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Save Event Configuration</span>
            </button>

            {saveSuccessNotice && (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 animate-fade-in">
                <Check className="w-4 h-4" />
                Settings Saved!
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleDeleteEvent(currentEditingEvent.id)}
            className="text-xs font-semibold text-red-600 hover:text-red-800 p-2 flex items-center gap-1 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete This Event
          </button>
        </div>
      </form>

      {/* New Event Modal */}
      {showNewEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900">Create New Society Event</h3>
            <p className="text-xs text-stone-500 mt-1">
              Set up a new festival (e.g. Navratri, Diwali, New Year Bash).
            </p>

            <form onSubmit={handleCreateNewEvent} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase text-stone-700 mb-1">
                  Event Name
                </label>
                <input
                  type="text"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder="e.g. Navratri Dandiya 2026"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-700 mb-1">
                    Event Code
                  </label>
                  <input
                    type="text"
                    value={newEventCode}
                    onChange={(e) => setNewEventCode(e.target.value)}
                    placeholder="e.g. NAV2026"
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm font-mono uppercase font-bold focus:border-orange-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-700 mb-1">
                    Contribution (₹)
                  </label>
                  <input
                    type="number"
                    value={newEventFee}
                    onChange={(e) => setNewEventFee(Number(e.target.value))}
                    placeholder="1800"
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm font-bold focus:border-orange-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-stone-700 mb-1">
                  Event Access Password
                </label>
                <input
                  type="text"
                  value={newEventPassword}
                  onChange={(e) => setNewEventPassword(e.target.value)}
                  placeholder="e.g. Dandiya@2026"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm font-mono focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div className="mt-5 pt-3 border-t border-stone-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewEventModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm"
                >
                  Create &amp; Switch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* WhatsApp Share Notice Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <Share2 className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-stone-900">
                  Share Resident Notice &amp; Links
                </h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-500 mt-2">
              Share this with society members on WhatsApp. The resident link restricts access purely to the Pass Generator with zero committee admin access.
            </p>

            {/* Direct Links Box */}
            <div className="mt-4 space-y-2.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-700 mb-1">
                  Resident Direct Pass Link (For Members)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={residentDirectLink}
                    className="flex-1 px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono text-stone-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(residentDirectLink);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className="py-2 px-3 rounded-xl bg-stone-900 text-white font-bold text-xs shrink-0 flex items-center gap-1"
                  >
                    {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{linkCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-700 mb-1">
                  Gate Volunteer QR Scanner Link (For Volunteers)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={volunteerScannerLink}
                    className="flex-1 px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono text-stone-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(volunteerScannerLink);
                      alert('Volunteer scanner link copied!');
                    }}
                    className="py-2 px-3 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold text-xs shrink-0 flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Formatted WhatsApp Message Preview */}
            <div className="mt-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-700 mb-1">
                WhatsApp Notice Template
              </label>
              <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-200 text-xs text-stone-800 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {whatsappNoticeText}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(whatsappNoticeText);
                  setNoticeCopied(true);
                  setTimeout(() => setNoticeCopied(false), 2500);
                }}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                {noticeCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{noticeCopied ? 'Notice Copied to Clipboard!' : 'Copy WhatsApp Notice'}</span>
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappNoticeText)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Share2 className="w-4 h-4" />
                <span>Open WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Change Master PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Change Committee Master PIN</h3>
            <p className="text-xs text-stone-500 mt-1">
              Set a secret PIN used to unlock the Admin Panel and event configuration.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newMasterPin.trim().length >= 4) {
                  setAdminMasterPin(newMasterPin.trim());
                  setPinChangeSuccess(true);
                  setTimeout(() => {
                    setPinChangeSuccess(false);
                    setShowPinModal(false);
                    setNewMasterPin('');
                  }, 1500);
                } else {
                  alert('PIN must be at least 4 characters/digits.');
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-bold uppercase text-stone-700 mb-1">
                  New Master PIN
                </label>
                <input
                  type="password"
                  value={newMasterPin}
                  onChange={(e) => setNewMasterPin(e.target.value)}
                  placeholder="e.g. 7890"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm font-mono tracking-widest text-center font-bold focus:border-orange-500 outline-none"
                  required
                />
              </div>

              {pinChangeSuccess && (
                <p className="text-xs font-bold text-emerald-700 text-center flex items-center justify-center gap-1">
                  <Check className="w-4 h-4" /> PIN Updated Successfully!
                </p>
              )}

              <div className="mt-4 pt-2 border-t border-stone-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm"
                >
                  Save PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Sheet Import Review Modal */}
      {excelImportResult && (
        <div
          id="modal-excel-import-review"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
        >
          <div className="relative max-w-lg w-full bg-white rounded-3xl p-6 shadow-2xl border border-stone-200 my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-stone-900">
                    Excel Sheet Import Review
                  </h3>
                  <p className="text-xs text-stone-500 truncate max-w-xs sm:max-w-sm">
                    {excelImportResult.fileName} &bull; {excelImportResult.totalRows} rows evaluated
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExcelImportResult(null)}
                className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Validation Rule Notice */}
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-amber-700" />
                <span>Verification Rule Applied:</span>
              </p>
              <p className="text-[11px] text-stone-700">
                Column 1 has House No and Column 2 has Amount. Only houses with amount equal to <strong>₹1,500</strong> are marked as <strong>PAID</strong>. All other houses (0, partial, or blank) are marked as <strong>UNPAID</strong> and excluded from passes.
              </p>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Paid Houses
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-1">
                  {excelImportResult.paidHouses.length}
                </div>
                <p className="text-[10px] text-emerald-700 mt-0.5">
                  Amount: ₹1,500 (Approved)
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/80 border border-rose-200 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                    Not Paid
                  </span>
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                </div>
                <div className="text-2xl font-black text-rose-700 mt-1">
                  {excelImportResult.unpaidHouses.length}
                </div>
                <p className="text-[10px] text-rose-700 mt-0.5">
                  Amount != ₹1,500 (Excluded)
                </p>
              </div>
            </div>

            {/* Paid Houses Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-800">
                  Verified Paid Houses Preview ({excelImportResult.paidHouses.length})
                </span>
                <span className="text-[10px] text-stone-400">Scroll to view</span>
              </div>
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 max-h-32 overflow-y-auto flex flex-wrap gap-1.5">
                {excelImportResult.paidHouses.length === 0 ? (
                  <p className="text-xs text-stone-400 py-2 w-full text-center">
                    No houses with amount ₹1,500 found.
                  </p>
                ) : (
                  excelImportResult.paidHouses.map((h) => (
                    <span
                      key={h}
                      className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold"
                    >
                      {h}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Unpaid Houses Preview */}
            {excelImportResult.unpaidHouses.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-700">
                    Excluded Unpaid Houses ({excelImportResult.unpaidHouses.length})
                  </span>
                  <span className="text-[10px] text-rose-600 font-semibold">Will not get passes</span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-100 max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
                  {excelImportResult.unpaidHouses.slice(0, 30).map((u, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-800 text-[11px] font-medium"
                    >
                      {u.house}: ₹{String(u.amount)}
                    </span>
                  ))}
                  {excelImportResult.unpaidHouses.length > 30 && (
                    <span className="text-[11px] text-stone-500 self-center">
                      +{excelImportResult.unpaidHouses.length - 30} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 border-t border-stone-100 space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={excelImportSyncing || excelImportResult.paidHouses.length === 0}
                  onClick={() => handleApplyExcelImport('replace')}
                  className="flex-1 py-2.5 px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{excelImportSyncing ? 'Syncing...' : 'Replace Entire List & Sync Online'}</span>
                </button>

                <button
                  type="button"
                  disabled={excelImportSyncing || excelImportResult.paidHouses.length === 0}
                  onClick={() => handleApplyExcelImport('append')}
                  className="flex-1 py-2.5 px-3.5 rounded-xl bg-stone-800 hover:bg-stone-900 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Append Paid Houses</span>
                </button>
              </div>

              <button
                type="button"
                disabled={excelImportSyncing}
                onClick={() => setExcelImportResult(null)}
                className="w-full py-2 rounded-xl text-stone-600 hover:bg-stone-100 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Pass View Modal */}
      {selectedPassForView && (
        <div
          id="modal-admin-view-pass"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
        >
          <div className="relative max-w-sm w-full my-auto">
            <PassCard
              pass={selectedPassForView}
              event={events.find((e) => e.id === selectedPassForView.eventId) || activeEvent}
              onClose={() => setSelectedPassForView(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Lucide Settings icon helper
function Settings2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  );
}
