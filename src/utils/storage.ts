import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SocietyEvent, PassRecord, GateCheckInRecord } from '../types';

const STORAGE_KEYS = {
  EVENTS: 'society_events_data_v1',
  ACTIVE_EVENT_ID: 'society_active_event_id_v1',
  ISSUED_PASSES: 'society_issued_passes',
  ISSUED_PASSES_V1: 'society_issued_passes_v1',
  ISSUED_PASSES_LEGACY: 'society_issued_passes',
  CHECK_INS: 'society_gate_checkins_v1',
  ADMIN_AUTH: 'society_admin_unlocked_v1',
  LAST_CLOUD_SYNC: 'society_last_cloud_sync_time',
};

export const DEFAULT_EVENTS: SocietyEvent[] = [
  {
    id: 'gm-2026',
    name: 'Taksh Divine Ganesh Mahotsav 2026',
    eventCode: 'GM2026',
    societyName: 'Taksh Divine',
    eventPassword: 'Ganesh@2026',
    contributionAmount: 1500,
    date: '19 Sep – 28 Sep 2026',
    venue: 'Clubhouse Lawn & Main Pandal',
    paidHouses: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    notes: 'Includes Maha Prasad Dinner on 26th Sep (Anant Chaturdashi)'
  },
  {
    id: 'nav-2026',
    name: 'Navratri Raas Dandiya 2026',
    eventCode: 'NAV2026',
    societyName: 'Taksh Divine',
    eventPassword: 'Dandiya@2026',
    contributionAmount: 1800,
    date: '12 Oct – 20 Oct 2026',
    venue: 'Central Amphitheatre & Sports Arena',
    paidHouses: [],
    createdAt: '2026-08-15T12:00:00.000Z',
    notes: 'Entry with dandiya sticks and dinner buffet pass'
  },
  {
    id: 'diw-2026',
    name: 'Diwali Sneh Milan & Annakut 2026',
    eventCode: 'DIW2026',
    societyName: 'Taksh Divine',
    eventPassword: 'Diwali@2026',
    contributionAmount: 2000,
    date: '08 Nov – 10 Nov 2026',
    venue: 'Society Banquet Hall & Terrace Garden',
    paidHouses: [],
    createdAt: '2026-08-20T14:00:00.000Z',
    notes: 'Includes family sweet hampers and gala banquet dinner'
  }
];

/**
 * Remove undefined fields before writing to Firestore
 */
function cleanForFirestore<T extends Record<string, any>>(obj: T): any {
  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

// -------------------------------------------------------------
// LOCAL CACHE HELPERS
// -------------------------------------------------------------

/**
 * Helper to identify original template sample pre-approved arrays
 */
export function isLegacySamplePaidList(arr: any[]): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  // Matches the legacy template sample lists
  if (arr.length === 34 && arr.includes('259') && arr.includes('151')) return true;
  if (arr.length === 14 && arr.includes('259') && arr.includes('151')) return true;
  if (arr.length === 12 && arr.includes('259') && arr.includes('150')) return true;
  if (arr.length === 8 && (arr.includes('A-101') || arr.includes('B-101'))) return true;
  return false;
}

export function getStoredEvents(): SocietyEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(DEFAULT_EVENTS));
      return DEFAULT_EVENTS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(DEFAULT_EVENTS));
      return DEFAULT_EVENTS;
    }

    // Auto-migrate: clear pre-approved house lists so committee updates them online
    let needsResave = false;
    const hasClearedPreApproved = localStorage.getItem('society_preapproved_cleared_v5');
    if (!hasClearedPreApproved) {
      parsed.forEach((evt: SocietyEvent) => {
        evt.paidHouses = [];
      });
      needsResave = true;
      localStorage.setItem('society_preapproved_cleared_v5', 'true');
    }

    parsed.forEach((evt: SocietyEvent) => {
      if (evt.societyName === 'Shree Balaji Heights CHS' || evt.societyName?.includes('Balaji') || !evt.societyName) {
        evt.societyName = 'Taksh Divine';
        needsResave = true;
      }
      if (evt.id === 'gm-2026' && evt.name === 'Ganesh Mahotsav 2026') {
        evt.name = 'Taksh Divine Ganesh Mahotsav 2026';
        needsResave = true;
      }
      if (!Array.isArray(evt.paidHouses)) {
        evt.paidHouses = [];
        needsResave = true;
      } else if (isLegacySamplePaidList(evt.paidHouses)) {
        evt.paidHouses = [];
        needsResave = true;
      } else {
        const migrated = Array.from(
          new Set(
            evt.paidHouses.map((h) => {
              const cleanDigits = (h || '').toString().replace(/\D/g, '');
              const num = parseInt(cleanDigits, 10);
              if (!isNaN(num) && num >= 1 && num <= 259) {
                return num.toString();
              }
              return cleanDigits || h;
            }).filter(Boolean)
          )
        );
        if (JSON.stringify(migrated) !== JSON.stringify(evt.paidHouses)) {
          evt.paidHouses = migrated;
          needsResave = true;
        }
      }
    });

    if (needsResave) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(parsed));
      syncEventsToCloud(parsed).catch(console.warn);
    }

    return parsed;
  } catch {
    return DEFAULT_EVENTS;
  }
}

export function saveStoredEvents(events: SocietyEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  } catch (err) {
    console.error('Failed to save events to localStorage', err);
  }

  // Push to Firestore asynchronously
  syncEventsToCloud(events).catch((err) => {
    console.warn('Failed to sync events to Firestore cloud:', err);
  });
}

export function getActiveEventId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEYS.ACTIVE_EVENT_ID);
    if (id) return id;
  } catch {}
  return DEFAULT_EVENTS[0].id;
}

export function setActiveEventId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_EVENT_ID, id);
  } catch {}
}

export function getStoredIssuedPasses(): PassRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ISSUED_PASSES) || localStorage.getItem(STORAGE_KEYS.ISSUED_PASSES_V1);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let needsResave = false;
    parsed.forEach((p: PassRecord) => {
      if (p.societyName === 'Shree Balaji Heights CHS' || p.societyName?.includes('Balaji') || !p.societyName) {
        p.societyName = 'Taksh Divine';
        needsResave = true;
      }
    });

    if (needsResave) {
      const serialized = JSON.stringify(parsed);
      localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES, serialized);
      localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES_V1, serialized);
    }

    return parsed;
  } catch {
    return [];
  }
}

export function saveIssuedPass(pass: PassRecord): void {
  try {
    const passes = getStoredIssuedPasses();
    const filtered = passes.filter(
      (p) => !(p.eventId === pass.eventId && p.houseNo.toUpperCase() === pass.houseNo.toUpperCase())
    );
    filtered.unshift(pass);
    const serialized = JSON.stringify(filtered);
    localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES, serialized);
    localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES_V1, serialized);
  } catch (err) {
    console.error('Failed to save pass to localStorage', err);
  }

  // Push to Firestore asynchronously
  savePassToCloud(pass).catch((err) => {
    console.warn('Failed to sync pass to Firestore cloud:', err);
  });
}

export function deleteSingleIssuedPass(passId: string): void {
  try {
    const passes = getStoredIssuedPasses().filter((p) => p.id !== passId);
    const serialized = JSON.stringify(passes);
    localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES, serialized);
    localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES_V1, serialized);
  } catch (err) {
    console.error('Failed to delete pass from localStorage', err);
  }

  // Remove from Firestore
  deleteDoc(doc(db, 'passes', passId)).catch((err) => {
    console.warn('Failed to delete pass in Firestore cloud:', err);
  });
}

export function clearIssuedPasses(eventId?: string, eventCode?: string): void {
  try {
    if (!eventId) {
      localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES);
      localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_V1);
      localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_LEGACY);
    } else {
      const passes = getStoredIssuedPasses().filter((p) => {
        if (p.eventId === eventId) return false;
        if (eventCode && p.eventCode?.toLowerCase() === eventCode.toLowerCase()) return false;
        return true;
      });
      if (passes.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES);
        localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_V1);
        localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_LEGACY);
      } else {
        const serialized = JSON.stringify(passes);
        localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES, serialized);
        localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES_V1, serialized);
      }
    }
  } catch (err) {
    console.error('Failed to clear passes from localStorage', err);
  }

  // Remove from Firestore
  clearPassesFromCloud(eventId, eventCode).catch((err) => {
    console.warn('Failed to clear passes from Firestore cloud:', err);
  });
}

export function clearAllEventData(eventId: string, eventCode?: string): void {
  clearIssuedPasses(eventId, eventCode);
  clearGateCheckIns(eventId, eventCode);
}

export function resetAllSocietyDatabase(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES);
    localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_V1);
    localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_LEGACY);
    localStorage.removeItem(STORAGE_KEYS.CHECK_INS);
    localStorage.removeItem(STORAGE_KEYS.EVENTS);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_EVENT_ID);
    localStorage.removeItem('society_admin_master_pin_v1');
    sessionStorage.clear();
  } catch (err) {
    console.error('Failed to reset all society database', err);
  }
}

export function getStoredCheckIns(): GateCheckInRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHECK_INS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordGateCheckIn(record: GateCheckInRecord): void {
  try {
    const records = getStoredCheckIns();
    records.unshift(record);
    const trimmed = records.slice(0, 1000);
    localStorage.setItem(STORAGE_KEYS.CHECK_INS, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save check-in', err);
  }

  // Push to Firestore
  recordCheckInToCloud(record).catch((err) => {
    console.warn('Failed to sync checkin to Firestore cloud:', err);
  });
}

export function clearGateCheckIns(eventId?: string, eventCode?: string): void {
  try {
    if (!eventId) {
      localStorage.removeItem(STORAGE_KEYS.CHECK_INS);
    } else {
      const records = getStoredCheckIns().filter((r) => {
        if (r.eventId === eventId) return false;
        if (eventCode && r.eventCode?.toLowerCase() === eventCode.toLowerCase()) return false;
        return true;
      });
      localStorage.setItem(STORAGE_KEYS.CHECK_INS, JSON.stringify(records));
    }
  } catch {}

  // Remove from Firestore
  clearCheckInsFromCloud(eventId, eventCode).catch((err) => {
    console.warn('Failed to clear check-ins from Firestore cloud:', err);
  });
}

/**
 * Checks if provided password matches Main Admin (123456)
 * Main Admin has full rights to remove/delete and modify all data.
 */
export function isAuthorizedAdminPin(pin: string): boolean {
  const trimmed = (pin || '').trim();
  const customPin = localStorage.getItem('society_admin_master_pin_v1');
  if (customPin && trimmed === customPin) return true;
  return trimmed === '123456';
}

/**
 * Checks if provided password matches Committee Member (1234) or Main Admin (123456)
 * Committee members can ONLY perform QR scanning at the gate.
 */
export function isAuthorizedCommitteePin(pin: string): boolean {
  const trimmed = (pin || '').trim();
  const customPin = localStorage.getItem('society_admin_master_pin_v1');
  if (customPin && trimmed === customPin) return true;
  return trimmed === '1234' || trimmed === '123456';
}

export function getAdminMasterPin(): string {
  return localStorage.getItem('society_admin_master_pin_v1') || '123456';
}

export function setAdminMasterPin(newPin: string): void {
  localStorage.setItem('society_admin_master_pin_v1', newPin);
}

export function exportSocietyDataBackup(): string {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    events: getStoredEvents(),
    activeEventId: getActiveEventId(),
    issuedPasses: getStoredIssuedPasses(),
    checkIns: getStoredCheckIns()
  };
  return JSON.stringify(data, null, 2);
}

export function importSocietyDataBackup(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    if (!data.events || !Array.isArray(data.events)) {
      throw new Error('Invalid backup file structure: missing events array.');
    }
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(data.events));
    if (data.activeEventId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_EVENT_ID, data.activeEventId);
    }
    if (Array.isArray(data.issuedPasses)) {
      localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES, JSON.stringify(data.issuedPasses));
    }
    if (Array.isArray(data.checkIns)) {
      localStorage.setItem(STORAGE_KEYS.CHECK_INS, JSON.stringify(data.checkIns));
    }
    // Also sync up to Firestore
    syncEventsToCloud(data.events).catch(console.error);
    return true;
  } catch (err) {
    console.error('Import failed', err);
    return false;
  }
}

// -------------------------------------------------------------
// FIREBASE FIRESTORE CLOUD INTEGRATION
// -------------------------------------------------------------

/**
 * Save single event directly to Firestore
 */
export async function saveEventToCloud(event: SocietyEvent): Promise<void> {
  const cleanData = cleanForFirestore(event);
  await setDoc(doc(db, 'events', event.id), cleanData);
}

/**
 * Sync full list of events to Firestore
 */
export async function syncEventsToCloud(events: SocietyEvent[]): Promise<void> {
  const batch = writeBatch(db);
  events.forEach((evt) => {
    const ref = doc(db, 'events', evt.id);
    batch.set(ref, cleanForFirestore(evt));
  });
  await batch.commit();
}

/**
 * Delete event from Firestore
 */
export async function deleteEventFromCloud(eventId: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId));
}

/**
 * Save single pass to Firestore
 */
export async function savePassToCloud(pass: PassRecord): Promise<void> {
  const cleanData = cleanForFirestore(pass);
  await setDoc(doc(db, 'passes', pass.id), cleanData);
}

/**
 * Clear passes from Firestore
 */
export async function clearPassesFromCloud(eventId?: string, eventCode?: string): Promise<void> {
  const passesRef = collection(db, 'passes');
  const snapshot = await getDocs(passesRef);
  const batch = writeBatch(db);
  let deleteCount = 0;
  snapshot.forEach((docItem) => {
    const data = docItem.data();
    if (
      !eventId ||
      data.eventId === eventId ||
      (eventCode && data.eventCode?.toLowerCase() === eventCode.toLowerCase()) ||
      !data.eventId
    ) {
      batch.delete(docItem.ref);
      deleteCount++;
    }
  });
  if (deleteCount > 0) {
    await batch.commit();
  }
}

/**
 * Save gate check-in to Firestore
 */
export async function recordCheckInToCloud(checkIn: GateCheckInRecord): Promise<void> {
  const cleanData = cleanForFirestore(checkIn);
  await setDoc(doc(db, 'checkins', checkIn.id), cleanData);
}

/**
 * Clear check-ins from Firestore
 */
export async function clearCheckInsFromCloud(eventId?: string, eventCode?: string): Promise<void> {
  const checkInsRef = collection(db, 'checkins');
  const snapshot = await getDocs(checkInsRef);
  const batch = writeBatch(db);
  let deleteCount = 0;
  snapshot.forEach((docItem) => {
    const data = docItem.data();
    if (
      !eventId ||
      data.eventId === eventId ||
      (eventCode && data.eventCode?.toLowerCase() === eventCode.toLowerCase()) ||
      !data.eventId
    ) {
      batch.delete(docItem.ref);
      deleteCount++;
    }
  });
  if (deleteCount > 0) {
    await batch.commit();
  }
}

/**
 * Real-time listener for Events & Paid House lists from Firestore
 */
export function subscribeToCloudEvents(
  onData: (events: SocietyEvent[]) => void,
  onError?: (error: any) => void
): () => void {
  const eventsCol = collection(db, 'events');
  return onSnapshot(
    eventsCol,
    (snapshot) => {
      if (snapshot.empty) {
        // First boot: Seed default events to Firestore so there's always ready data
        const localEvents = getStoredEvents();
        syncEventsToCloud(localEvents).catch(console.warn);
        onData(localEvents);
      } else {
        const loaded: SocietyEvent[] = [];
        let anyMigrated = false;
        snapshot.forEach((docSnap) => {
          const item = docSnap.data() as SocietyEvent;
          if (item.societyName === 'Shree Balaji Heights CHS' || item.societyName?.includes('Balaji') || !item.societyName) {
            item.societyName = 'Taksh Divine';
            anyMigrated = true;
          }
          if (isLegacySamplePaidList(item.paidHouses)) {
            item.paidHouses = [];
            anyMigrated = true;
          }
          if (anyMigrated) {
            saveEventToCloud(item).catch(console.warn);
          }
          loaded.push(item);
        });
        // Sort by createdAt descending
        loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        // Update local storage cache
        try {
          localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(loaded));
        } catch {}
        onData(loaded);
      }
    },
    (err) => {
      console.warn('Firestore events listener error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time listener for Issued Passes from Firestore
 */
export function subscribeToCloudPasses(
  onData: (passes: PassRecord[]) => void,
  onError?: (error: any) => void
): () => void {
  const passesCol = collection(db, 'passes');
  return onSnapshot(
    passesCol,
    (snapshot) => {
      const loaded: PassRecord[] = [];
      snapshot.forEach((docSnap) => {
        const pass = docSnap.data() as PassRecord;
        if (pass.societyName === 'Shree Balaji Heights CHS' || pass.societyName?.includes('Balaji') || !pass.societyName) {
          pass.societyName = 'Taksh Divine';
          savePassToCloud(pass).catch(console.warn);
        }
        loaded.push(pass);
      });
      loaded.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
      try {
        localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES, JSON.stringify(loaded));
        localStorage.setItem(STORAGE_KEYS.ISSUED_PASSES_V1, JSON.stringify(loaded));
      } catch {}
      onData(loaded);
    },
    (err) => {
      console.warn('Firestore passes listener error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time listener for Gate Check-Ins from Firestore
 */
export function subscribeToCloudCheckIns(
  onData: (checkIns: GateCheckInRecord[]) => void,
  onError?: (error: any) => void
): () => void {
  const checkInsCol = collection(db, 'checkins');
  return onSnapshot(
    checkInsCol,
    (snapshot) => {
      const loaded: GateCheckInRecord[] = [];
      snapshot.forEach((docSnap) => {
        loaded.push(docSnap.data() as GateCheckInRecord);
      });
      loaded.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
      try {
        localStorage.setItem(STORAGE_KEYS.CHECK_INS, JSON.stringify(loaded));
      } catch {}
      onData(loaded);
    },
    (err) => {
      console.warn('Firestore checkins listener error:', err);
      if (onError) onError(err);
    }
  );
}
