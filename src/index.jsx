import React from 'react';
import ReactDOM from 'react-dom';
import FarmDashboard from './FarmDashboard.jsx';

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "1:XXXXXXXXXXXX:web:XXXXXXXXXXXX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

signInAnonymously(auth)
  .then(() => console.log("✅ Login anônimo realizado"))
  .catch((error) => console.error("❌ Erro no login anônimo:", error));

ReactDOM.render(
  <FarmDashboard />,
  document.getElementById('root')
);
