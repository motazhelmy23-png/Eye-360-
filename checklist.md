# Eye 360 Implementation Checklist

## Project Setup
- [ ] Initialize Vite/TypeScript React project.
- [ ] Configure `metadata.json` (name: "Eye 360").
- [ ] Set up directory structure (`components`, `views`, `services`, `hooks`, `db`, `utils`, `types`, `constants`, `tests`).
- [ ] Configure Tailwind CSS.

## Firebase & Security
- [ ] Implement Firebase Initialization (getApps check).
- [ ] Implement `VITE_FIREBASE_PROJECT_ID` safety guard.
- [ ] Create `firebaseClient.ts`.
- [ ] Create `authService.ts`.
- [ ] Develop `firestore.rules` and `firestore.indexes.json` (as per rules/helper requirements).

## Data & IndexedDB
- [ ] Set up `indexedDbService.ts` (Dexie).
- [ ] Implement `catalogService.ts` (chunking strategy).
- [ ] Implement `excelParser.ts` (SheetJS).
- [ ] Create `inventoryUpdateService.ts` (Delta logic).
- [ ] Implement `barcodeService.ts`.

## UI & Operational Workflows
- [ ] Implement RTL/Arabic layout.
- [ ] Build Authentication screens (Admin/Branch roles).
- [ ] Develop Admin Dashboard (Daily Update, Catalog Replacement, Branch Management, Diagnostics).
- [ ] Develop Branch Dashboard (Search, Scan).
- [ ] Implement Product Search (IndexedDB).
- [ ] Implement Barcode scanning (Camera/USB).

## Inventory Management
- [ ] Implement Inventory Counting module.
- [ ] Implement Error Reporting (`errorReportService.ts`).
- [ ] Implement Audit History (`auditService.ts`).

## Testing & Quality
- [ ] Create deterministic unit tests for parser, diff engine, chunking, fingerprinting.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.

## Final Delivery
- [ ] Verify source audit (no legacy names).
- [ ] Finalize Delivery Report.
