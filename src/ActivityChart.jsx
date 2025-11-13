import React from "react";

const ActivityChart = ({ data = [] }) => {
  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "12px",
        backgroundColor: "#f0f9ff",
        boxShadow: "0 2px 5px rgba(0, 0, 0, 0.1)",
        marginTop: "10px"
      }}
    >
      <h3 style={{ marginBottom: "10px" }}>📊 Atividade da Fazenda</h3>

      {data.length === 0 ? (
        <p>Nenhum dado disponível.</p>
      ) : (
        <ul>
          {data.map((item, i) => (
            <li key={i}>
              {item.nome || "Atividade"} — {item.valor || 0}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ActivityChart;
