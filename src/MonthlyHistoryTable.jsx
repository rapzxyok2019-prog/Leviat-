import React from "react";

// Tabela simples de histórico mensal — placeholder para evitar erro no build
const MonthlyHistoryTable = ({ data = [] }) => {
  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "12px",
        backgroundColor: "#f8f8f8",
        boxShadow: "0 2px 5px rgba(0, 0, 0, 0.1)",
        marginTop: "10px"
      }}
    >
      <h3 style={{ marginBottom: "10px" }}>📅 Histórico Mensal</h3>

      {data.length === 0 ? (
        <p>Nenhum registro encontrado.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#e0e0e0" }}>
              <th style={{ padding: "8px", textAlign: "left" }}>Mês</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Produção</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Gastos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index}>
                <td style={{ padding: "6px" }}>{row.mes || "Desconhecido"}</td>
                <td style={{ padding: "6px" }}>{row.producao || 0}</td>
                <td style={{ padding: "6px" }}>{row.gastos || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MonthlyHistoryTable;
