# Security Specification: Society Event & Digital Pass Management

## Data Invariants
1. Events must have a valid non-empty identifier, event code, and a list of paid house numbers (`paidHouses`).
2. An event's `paidHouses` list must be bounded to at most 1,000 entries to prevent memory exhaustion attacks.
3. Passes must reference an existing event ID, have a valid house number, resident name, and member count between 1 and 50.
4. Gate check-ins must contain valid event reference, house number, timestamp, and status ('approved' | 'duplicate_warning' | 'invalid').
5. Path IDs must conform to safe alphanumeric characters with hyphen/underscore up to 128 characters.

## Security Rules Architecture
- Catch-all default deny: `match /{document=**} { allow read, write: if false; }`
- Collection `/events/{eventId}`: Publicly readable for active festival schedules and paid roster checks; writeable with schema validation.
- Collection `/passes/{passId}`: Readable and writeable with pass schema validation.
- Collection `/checkins/{checkinId}`: Readable and writeable for gate scanning stations and attendance validation.
