import React from 'react';
import ReactDOM from 'react-dom'; // 🚨 Voltar para a importação padrão do React 17
import FarmDashboard from './FarmDashboard.jsx'; // Seu componente principal

// SOLUÇÃO FINAL: Usamos o método render() do React 17 e removemos o StrictMode
ReactDOM.render(
  <FarmDashboard />, // Sem o StrictMode, o erro #200 deve parar
  document.getElementById('root') 
);
