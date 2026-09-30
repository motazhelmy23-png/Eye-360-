export type SessionType = 'FULL' | 'CATEGORY' | 'SELECTED_PRODUCTS';
export type SessionStatus = 'DRAFT' | 'ACTIVE' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
export type CountStatus = 'COUNTED' | 'RECOUNT_REQUIRED' | 'RECOUNTED';

export interface InventorySession {
  id: string;
  name: string;
  branchId: string;
  branchName?: string;
  inventoryLocationId: string;
  inventoryLocationName?: string;

  type: SessionType;
  category: string | null;
  selectedItemCodes: string[] | null;

  assignedUserIds: string[];
  assignedUserNames?: string[];

  blindCount: boolean;
  status: SessionStatus;

  baselineCatalogVersionId: string | null;
  baselineRevision: number | null;

  baselineProductCount: number;
  baselineChunkCount: number;
  baselineChecksum: string | null;
  baselineSnapshotStatus: 'NOT_CREATED' | 'UPLOADING' | 'VERIFIED';

  createdAt: any;
  createdByUid: string;
  createdByName?: string;

  startedAt?: any;
  startedByUid?: string;

  reviewStartedAt?: any;
  reviewStartedByUid?: string;

  completedAt?: any;
  completedByUid?: string;

  cancelledAt?: any;
  cancelledByUid?: string;
  cancellationReason?: string;
}

export interface BaselineProductEntry {
  itemCode: string;
  name: string | null;
  barcode: string | null;
  modelCode: string | null;
  category: string | null;
  baselineQty: number;
}

export interface BaselineChunk {
  chunkIndex: number;
  products: BaselineProductEntry[];
}

export interface CountHistoryEntry {
  qty: number;
  changedByUid: string;
  changedByName?: string;
  changedAt: any;
}

export interface ProductCountRecord {
  itemCode: string;
  branchId: string;
  currentQty: number;

  firstQty: number;
  firstCountedByUid: string;
  firstCountedByName?: string;
  firstCountedAt: any;

  lastUpdatedByUid: string;
  lastUpdatedByName?: string;
  lastUpdatedAt: any;

  editCount: number;
  history: CountHistoryEntry[];

  status: CountStatus;
  unexpected: boolean;

  recountRequested?: boolean;
  recountRequestedAt?: any;
  recountRequestedByUid?: string;

  recountQty?: number | null;
  recountedByUid?: string | null;
  recountedByName?: string | null;
  recountedAt?: any;
}

export interface VarianceReviewItem {
  itemCode: string;
  name: string;
  barcode: string;
  modelCode: string;
  category: string;
  baselineQty: number;
  firstQty: number | null;
  currentQty: number | null;
  recountQty: number | null;
  finalCountQty: number | null;
  variance: number | null;
  semanticStatus: 'MATCH' | 'SHORTAGE' | 'OVERAGE' | 'UNCOUNTED' | 'RECOUNT_REQUIRED';
  countStatus: CountStatus | 'UNCOUNTED';
  unexpected: boolean;
  firstCountedByName?: string;
  recountedByName?: string;
}
