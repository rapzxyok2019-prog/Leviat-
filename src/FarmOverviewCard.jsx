import React from "react";

const FarmOverviewCard = ({ title, value }) => (
  <div
    style={{
      background: "#e3f2fd",
      padding: "16px",
      borderRadius: "10px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      margin: "8px 0"
    }}
  >
    <h4>{title}</h4>
    <p style={{ fontWeight: "bold", fontSize: "1.2em" }}>{value}</p>
  </div>
);

export default FarmOverviewCard;
