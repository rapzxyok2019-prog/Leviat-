import React from "react";

// Componente genérico para exibir progresso ou informações
const MemberProgressViewer = ({ user, progress }) => {
  return (
    <div style={{
      padding: "20px",
      borderRadius: "12px",
      backgroundColor: "#f4f4f4",
      textAlign: "center",
      margin: "10px",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)"
    }}>
      <h3 style={{ marginBottom: "10px" }}>👤 Membro: {user || "Anônimo"}</h3>
      <p>📊 Progresso atual: {progress ?? "Não disponível"}</p>
    </div>
  );
};

export default MemberProgressViewer;
