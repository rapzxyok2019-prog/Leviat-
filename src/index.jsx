import React from 'react';
import ReactDOM from 'react-dom/client';
// 🚨 ATENÇÃO: Verifique se o nome do arquivo do seu componente principal é FarmDashboard.jsx
import FarmDashboard from './FarmDashboard.jsx'; 
// Se o nome for diferente, mude a linha acima para, por exemplo: import App from './App.jsx';

// Cria a raiz de renderização do React 18 no elemento com id="root"
const root = ReactDOM.createRoot(document.getElementById('root'));

// Renderiza o componente principal
root.render(
  // O React.StrictMode é bom para detectar problemas durante o desenvolvimento
  <React.StrictMode>
    <FarmDashboard />
  </React.StrictMode>
);
