import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

const FORBIDDEN_PROJECT_ID = "radio-talaat-inventory";
if (config.projectId === FORBIDDEN_PROJECT_ID) {
  throw new Error("Eye 360 cannot use the legacy Firebase project.");
}

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use memoryLocalCache and experimentalAutoDetectLongPolling to prevent backend timeout and disconnection issues in web/iframe networks
const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalAutoDetectLongPolling: true,
}, config.firestoreDatabaseId);

export { app, auth, db };

export const getFirebaseDiagnostics = () => ({
  projectId: config.projectId,
  firestoreDatabaseId: config.firestoreDatabaseId,
  authUid: auth.currentUser?.uid || 'no-user',
  firestoreStatus: db ? 'initialized' : 'not-initialized',
});
