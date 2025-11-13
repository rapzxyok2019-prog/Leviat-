// src/firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Configuração do Firebase (suas chaves reais)
const firebaseConfig = {
  apiKey: "AIzaSyB2mlLKLqVwvx7FMq8qLkYAwHLkjljDYIU",
  authDomain: "controle-de-farm-leviata.firebaseapp.com",
  projectId: "controle-de-farm-leviata",
  storageBucket: "controle-de-farm-leviata.firebasestorage.app",
  messagingSenderId: "736608761330",
  appId: "1:736608761330:web:3e7193c697eea4ff7e676b"
};

// Inicializa o app e serviços
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Login anônimo automático
signInAnonymously(auth)
  .then(() => console.log("✅ Login anônimo bem-sucedido"))
  .catch((error) => console.error("❌ Erro no login anônimo:", error));

export { app, db, auth };
