import React, { useState } from "react";

/**
 * Componente Tabs genérico e leve.
 * Permite alternar entre seções de conteúdo com botões.
 * Pode ser usado em dashboards, painéis, etc.
 */
const Tabs = ({ tabs }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!tabs || tabs.length === 0) {
    return <div>Nenhuma aba disponível.</div>;
  }

  return (
    <div className="tabs-container" style={styles.container}>
      <div className="tabs-header" style={styles.header}>
        {tabs.map((tab, index) => (
          <button
            key={index}
            style={{
              ...styles.tabButton,
              ...(activeIndex === index ? styles.activeButton : {}),
            }}
            onClick={() => setActiveIndex(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tabs-content" style={styles.content}>
        {tabs[activeIndex].content}
      </div>
    </div>
  );
};

const styles = {
  container: {
    width: "100%",
    maxWidth: "800px",
    margin: "0 auto",
    background: "#121212",
    borderRadius: "10px",
    padding: "16px",
    color: "#fff",
    boxShadow: "0 0 10px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex",
    justifyContent: "space-around",
    marginBottom: "12px",
  },
  tabButton: {
    flex: 1,
    margin: "0 4px",
    padding: "10px",
    cursor: "pointer",
    background: "#1e1e1e",
    color: "#bbb",
    border: "1px solid #333",
    borderRadius: "6px",
    transition: "0.2s",
  },
  activeButton: {
    background: "#2a2a2a",
    color: "#00e676",
    border: "1px solid #00e676",
  },
  content: {
    background: "#181818",
    borderRadius: "8px",
    padding: "12px",
    minHeight: "120px",
  },
};

export default Tabs;
