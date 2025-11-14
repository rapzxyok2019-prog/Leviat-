import React from 'react';
import ReactDOM from 'react-dom';
import FarmDashboard from './FarmDashboard.jsx';

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

console.log("🔥 Configurando Firebase...");

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

signInAnonymously(auth)
  .then(() => console.log("✅ Login anônimo realizado com sucesso"))
  .catch((error) => console.error("❌ Erro no login anônimo:", error));

ReactDOM.render(
  <React.StrictMode>
    <FarmDashboard />
  </React.StrictMode>,
  document.getElementById('root')
);
