import React from 'react';
import ReactDOM from 'react-dom'; 
import FarmDashboard from './FarmDashboard.jsx'; // Seu componente principal

// --- 🔥 Firebase SDK ---
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// --- 🔧 Configuração do Firebase (substitua pelos dados do seu projeto) ---
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "1:XXXXXXXXXXXX:web:XXXXXXXXXXXX"
};

// --- 🚀 Inicializa o app e serviços ---
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);

// --- 👤 Login anônimo automático ---
signInAnonymously(auth)
  .then(() => console.log("✅ Login anônimo realizado"))
  .catch((error) => console.error("❌ Erro no login anônimo:", error));

// --- 💻 Renderização principal ---
ReactDOM.render(
  <FarmDashboard />,
  document.getElementById('root')
);
