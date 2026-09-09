/**
 * Event & Digital Pass Management System Types
 */

export interface SocietyEvent {
  id: string;
  name: string;
  eventCode: string;
  societyName: string;
  eventPassword: string;
  contributionAmount: number;
  date: string;
  venue: string;
  paidHouses: string[];
  createdAt: string;
  notes?: string;
}

export interface PassRecord {
  id: string;
  eventId: string;
  eventCode: string;
  societyName: string;
  eventName: string;
  houseNo: string;
  residentName: string;
  memberCount: number;
  foodPreference?: 'regular' | 'swaminarayan_jain';
  swaminarayanCount?: number;
  phone?: string;
  qrPayload: string;
  issuedAt: string;
  amountPaid: number;
}

export interface GateCheckInRecord {
  id: string;
  eventId: string;
  eventCode: string;
  houseNo: string;
  residentName: string;
  memberCount: number;
  swaminarayanCount?: number;
  foodPreference?: 'regular' | 'swaminarayan_jain';
  scannedAt: string;
  status: 'approved' | 'duplicate_warning' | 'invalid';
  rawPayload: string;
  reason?: string;
  totalRegistered?: number;
  alreadyEntered?: number;
  remaining?: number;
}

export interface QRPayloadParsed {
  eventCode: string;
  houseNo: string;
  residentName: string;
  memberCount: number;
  foodPreference?: 'regular' | 'swaminarayan_jain';
  swaminarayanCount?: number;
}

export interface ScanVerificationResult {
  status: 'approved' | 'duplicate' | 'invalid';
  title: string;
  message: string;
  parsed?: QRPayloadParsed;
  matchedEvent?: SocietyEvent;
  previousCheckIn?: GateCheckInRecord;
  previousEntries?: GateCheckInRecord[];
  totalRegistered?: number;
  alreadyEntered?: number;
  remaining?: number;
  rawText: string;
}
