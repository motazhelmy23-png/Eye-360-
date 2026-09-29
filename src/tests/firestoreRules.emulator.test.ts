import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// In AI Studio container, Firebase Emulator is not running (requires Java & firebase-tools).
// The suite is designed to run automatically when FIRESTORE_EMULATOR_HOST is defined.
const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!isEmulatorRunning)('Firestore Security Rules Real Emulator Test Suite', () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = 'eye-360-emulator-test';
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: rulesContent,
        host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
        port: parseInt(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8080', 10),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();

      // Seed baseline environment using admin context
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const firestore = context.firestore();

        // 1. Admin doc
        await setDoc(doc(firestore, 'admins', 'admin_1'), {
          role: 'admin',
          isActive: true,
          name: 'Super Admin',
        });

        // 2. Active Branch
        await setDoc(doc(firestore, 'branches', 'branch_active'), {
          name: 'Active Branch',
          isActive: true,
          inventoryLocationId: 'loc_active',
        });

        // 3. Inactive Branch
        await setDoc(doc(firestore, 'branches', 'branch_inactive'), {
          name: 'Inactive Branch',
          isActive: false,
          inventoryLocationId: 'loc_inactive',
        });

        // 4. Active Sales with Active Branch
        await setDoc(doc(firestore, 'users', 'sales_active'), {
          role: 'sales',
          isActive: true,
          branchId: 'branch_active',
          name: 'Active Sales',
        });

        // 5. Active Sales with Inactive Branch
        await setDoc(doc(firestore, 'users', 'sales_inactive_branch'), {
          role: 'sales',
          isActive: true,
          branchId: 'branch_inactive',
          name: 'Sales Inactive Branch',
        });

        // 6. Disabled Sales User
        await setDoc(doc(firestore, 'users', 'sales_disabled'), {
          role: 'sales',
          isActive: false,
          branchId: 'branch_active',
          name: 'Disabled Sales',
        });

        // 7. Sales with Missing Branch
        await setDoc(doc(firestore, 'users', 'sales_missing_branch'), {
          role: 'sales',
          isActive: true,
          branchId: 'branch_non_existent',
          name: 'Sales Missing Branch',
        });

        // 8. Global App Settings: activeCatalogVersionId = 'cat_active', activeInventoryRevision = 1
        await setDoc(doc(firestore, 'app_settings', 'global'), {
          activeCatalogVersionId: 'cat_active',
          activeInventoryRevision: 1,
        });

        // 9. Active Catalog Version & Chunks
        await setDoc(doc(firestore, 'catalog_versions', 'cat_active'), {
          versionId: 'cat_active',
          status: 'active',
          productCount: 100,
        });
        await setDoc(doc(firestore, 'catalog_versions', 'cat_active', 'chunks', 'chunk_000'), {
          chunkIndex: 0,
          payloadJson: '[]',
        });

        // 10. Inactive / Staged Catalog Version
        await setDoc(doc(firestore, 'catalog_versions', 'cat_staged'), {
          versionId: 'cat_staged',
          status: 'staged',
        });

        // 11. Inventory Updates in Active Catalog:
        // - Published Rev 1 (allowed to read)
        await setDoc(doc(firestore, 'catalog_versions', 'cat_active', 'inventory_updates', 'upd_rev1'), {
          updateId: 'upd_rev1',
          catalogVersionId: 'cat_active',
          baseRevision: 0,
          targetRevision: 1,
          status: 'published',
        });
        // - Published Rev 2 (above activeInventoryRevision 1 -> forbidden to read)
        await setDoc(doc(firestore, 'catalog_versions', 'cat_active', 'inventory_updates', 'upd_rev2'), {
          updateId: 'upd_rev2',
          catalogVersionId: 'cat_active',
          baseRevision: 1,
          targetRevision: 2,
          status: 'published',
        });
        // - Staged Update (forbidden to read for sales)
        await setDoc(doc(firestore, 'catalog_versions', 'cat_active', 'inventory_updates', 'upd_staged'), {
          updateId: 'upd_staged',
          catalogVersionId: 'cat_active',
          baseRevision: 1,
          targetRevision: 2,
          status: 'staged',
        });
      });
    }
  });

  it('1. unauthenticated user cannot read or write any documents', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, 'branches', 'branch_active')));
    await assertFails(getDoc(doc(unauthedDb, 'catalog_versions', 'cat_active')));
    await assertFails(setDoc(doc(unauthedDb, 'branches', 'new_branch'), { name: 'Test' }));
  });

  it('2. unknown authenticated user cannot read operational data or admin collections', async () => {
    const randomUserDb = testEnv.authenticatedContext('random_uid').firestore();
    await assertFails(getDoc(doc(randomUserDb, 'admins', 'admin_1')));
    await assertFails(getDoc(doc(randomUserDb, 'branches', 'branch_active')));
    await assertFails(getDoc(doc(randomUserDb, 'catalog_versions', 'cat_active')));
    await assertFails(setDoc(doc(randomUserDb, 'branches', 'hack_branch'), { name: 'Hack' }));
  });

  it('3. active admin can manage branches and write app_settings', async () => {
    const adminDb = testEnv.authenticatedContext('admin_1').firestore();
    // Admin can read and write branches
    await assertSucceeds(getDoc(doc(adminDb, 'branches', 'branch_active')));
    await assertSucceeds(setDoc(doc(adminDb, 'branches', 'new_branch_by_admin'), {
      name: 'Admin Branch',
      isActive: true,
      inventoryLocationId: 'loc_admin',
    }));
    // Admin can write app_settings
    await assertSucceeds(setDoc(doc(adminDb, 'app_settings', 'global'), {
      activeCatalogVersionId: 'cat_active',
      activeInventoryRevision: 2,
    }));
  });

  it('4. active sales with active branch can read permitted operational data', async () => {
    const salesDb = testEnv.authenticatedContext('sales_active').firestore();
    // Can read active branch
    await assertSucceeds(getDoc(doc(salesDb, 'branches', 'branch_active')));
    // Can read active catalog version and its chunks
    await assertSucceeds(getDoc(doc(salesDb, 'catalog_versions', 'cat_active')));
    await assertSucceeds(getDoc(doc(salesDb, 'catalog_versions', 'cat_active', 'chunks', 'chunk_000')));
    // Can read published update up to activeInventoryRevision (rev 1)
    await assertSucceeds(getDoc(doc(salesDb, 'catalog_versions', 'cat_active', 'inventory_updates', 'upd_rev1')));
  });

  it('5. sales cannot write branches or app_settings', async () => {
    const salesDb = testEnv.authenticatedContext('sales_active').firestore();
    await assertFails(setDoc(doc(salesDb, 'branches', 'sales_hack_branch'), { name: 'Hack' }));
    await assertFails(setDoc(doc(salesDb, 'app_settings', 'global'), { activeInventoryRevision: 99 }));
  });

  it('6. sales cannot change own role or branchId in users/{uid}', async () => {
    const salesDb = testEnv.authenticatedContext('sales_active').firestore();
    await assertFails(updateDoc(doc(salesDb, 'users', 'sales_active'), { role: 'admin' }));
    await assertFails(updateDoc(doc(salesDb, 'users', 'sales_active'), { branchId: 'other_branch' }));
  });

  it('7. sales cannot read staged/failed updates or updates above activeInventoryRevision', async () => {
    const salesDb = testEnv.authenticatedContext('sales_active').firestore();
    // Cannot read staged update
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active', 'inventory_updates', 'upd_staged')));
    // Cannot read update where targetRevision (2) > activeInventoryRevision (1)
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active', 'inventory_updates', 'upd_rev2')));
  });

  it('8. inactive-branch sales cannot read operational catalog data', async () => {
    const salesDb = testEnv.authenticatedContext('sales_inactive_branch').firestore();
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active')));
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active', 'chunks', 'chunk_000')));
  });

  it('9. disabled sales cannot read operational catalog data', async () => {
    const salesDb = testEnv.authenticatedContext('sales_disabled').firestore();
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active')));
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active', 'chunks', 'chunk_000')));
  });

  it('10. sales with missing branch cannot read operational catalog data', async () => {
    const salesDb = testEnv.authenticatedContext('sales_missing_branch').firestore();
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active')));
    await assertFails(getDoc(doc(salesDb, 'catalog_versions', 'cat_active', 'chunks', 'chunk_000')));
  });
});
