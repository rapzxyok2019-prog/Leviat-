import React from 'react';
import ReactDOM from 'react-dom/client'; // 🚨 IMPORTAÇÃO CORRETA para React 18
import FarmDashboard from './FarmDashboard.jsx'; // Seu componente principal

// AQUI ESTÁ A CORREÇÃO PRINCIPAL: Usamos createRoot para inicializar o app
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <FarmDashboard />
  </React.StrictMode>
);

// OU, para tentar a solução mais simples que remove o StrictMode (já que ele pode causar problemas)
/*
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
    <FarmDashboard />
);
*/
