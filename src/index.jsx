import React from 'react';
import ReactDOM from 'react-dom'; // 🚨 IMPORTAÇÃO CORRETA para React 17
import FarmDashboard from './FarmDashboard.jsx'; // Seu componente principal

// Usa o método render() que é o padrão do React 17
ReactDOM.render(
  <React.StrictMode>
    <FarmDashboard />
  </React.StrictMode>,
  document.getElementById('root') // Renderiza no elemento com id="root"
);
