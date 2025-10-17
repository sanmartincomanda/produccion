// src/firebase.js
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getAuth } from "firebase/auth"; // 👈 IMPORTANTE

const firebaseConfig = {
  apiKey: "AIzaSyCNjoUvZdproZfv1HqAVeyHA94Nn7NYwBA",
  authDomain: "inventario-sanmartin.firebaseapp.com",
  projectId: "inventario-sanmartin",
  storageBucket: "inventario-sanmartin.firebasestorage.app",
  messagingSenderId: "135175270983",
  appId: "1:135175270983:web:66add2c6cd34ba07333762",
  measurementId: "G-DSTY4KY0T8"
};

const app = initializeApp(firebaseConfig);

// 🔧 Firestore: cache persistente + long-polling
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true
});

// 👇 vuelve a agregar esto
export const auth = getAuth(app);

export default app;
