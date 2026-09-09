import { SocietyEvent, PassRecord, GateCheckInRecord } from '../types';

const STORAGE_KEYS = {
  EVENTS: 'society_events_data_v1',
  ACTIVE_EVENT_ID: 'society_active_event_id_v1',
  ISSUED_PASSES: 'society_issued_passes',
  ISSUED_PASSES_V1: 'society_issued_passes_v1',
  ISSUED_PASSES_LEGACY: 'society_issued_passes',
  CHECK_INS: 'society_gate_checkins_v1',
  ADMIN_AUTH: 'society_admin_unlocked_v1',
};

export const DEFAULT_EVENTS: SocietyEvent[] = [
  {
    id: 'gm-2026',
    name: 'Ganesh Mahotsav 2026',
    eventCode: 'GM2026',
    societyName: 'Shree Balaji Heights CHS',
    eventPassword: 'Ganesh@2026',
    contributionAmount: 1500,
    date: '19 Sep – 28 Sep 2026',
    venue: 'Clubhouse Lawn & Main Pandal',
    paidHouses: [
      '1', '2', '5', '8', '10', '15', '20',
      '101', '102', '103', '104', '105', '106', '107', '108',
      '120', '125', '130', '140', '150', '151', '152',
      '201', '202', '203', '204', '205', '210', '220',
      '250', '251', '255', '258', '259'
    ],
    createdAt: '2026-08-01T10:00:00.000Z',
    notes: 'Includes Maha Prasad Dinner on 26th Sep (Anant Chaturdashi)'
  },
  {
    id: 'nav-2026',
    name: 'Navratri Raas Dandiya 2026',
    eventCode: 'NAV2026',
    societyName: 'Shree Balaji Heights CHS',
    eventPassword: 'Dandiya@2026',
    contributionAmount: 1800,
    date: '12 Oct – 20 Oct 2026',
    venue: 'Central Amphitheatre & Sports Arena',
    paidHouses: [
      '1', '2', '10', '101', '102', '103', '104',
      '150', '151', '201', '202', '203', '250', '259'
    ],
    createdAt: '2026-08-15T12:00:00.000Z',
    notes: 'Entry with dandiya sticks and dinner buffet pass'
  },
  {
    id: 'diw-2026',
    name: 'Diwali Sneh Milan & Annakut 2026',
    eventCode: 'DIW2026',
    societyName: 'Shree Balaji Heights CHS',
    eventPassword: 'Diwali@2026',
    contributionAmount: 2000,
    date: '08 Nov – 10 Nov 2026',
    venue: 'Society Banquet Hall & Terrace Garden',
    paidHouses: [
      '1', '5', '101', '102', '104', '105', '150',
      '201', '202', '204', '250', '259'
    ],
    createdAt: '2026-08-20T14:00:00.000Z',
    notes: 'Includes family sweet hampers and gala banquet dinner'
  }
];

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

    // Auto-migrate any legacy "A-101" formatted house numbers to pure numeric 1-259
    let needsResave = false;
    parsed.forEach((evt: SocietyEvent) => {
      if (Array.isArray(evt.paidHouses)) {
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
    return Array.isArray(parsed) ? parsed : [];
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
}

export function clearIssuedPasses(eventId?: string): void {
  try {
    if (!eventId) {
      localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES);
      localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_V1);
      localStorage.removeItem(STORAGE_KEYS.ISSUED_PASSES_LEGACY);
    } else {
      const passes = getStoredIssuedPasses().filter((p) => p.eventId !== eventId);
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
}

export function clearAllEventData(eventId: string): void {
  clearIssuedPasses(eventId);
  clearGateCheckIns(eventId);
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
    // keep up to 1000 records
    const trimmed = records.slice(0, 1000);
    localStorage.setItem(STORAGE_KEYS.CHECK_INS, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save check-in', err);
  }
}

export function clearGateCheckIns(eventId?: string): void {
  try {
    if (!eventId) {
      localStorage.removeItem(STORAGE_KEYS.CHECK_INS);
    } else {
      const records = getStoredCheckIns().filter((r) => r.eventId !== eventId);
      localStorage.setItem(STORAGE_KEYS.CHECK_INS, JSON.stringify(records));
    }
  } catch {}
}

export function getAdminMasterPin(): string {
  return localStorage.getItem('society_admin_master_pin_v1') || '1234';
}

export function setAdminMasterPin(newPin: string): void {
  localStorage.setItem('society_admin_master_pin_v1', newPin);
}

/**
 * Export full state as JSON string for offline sharing between society volunteers
 */
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

/**
 * Import state from JSON
 */
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
    return true;
  } catch (err) {
    console.error('Import failed', err);
    return false;
  }
}
