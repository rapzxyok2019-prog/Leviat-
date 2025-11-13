// src/FarmDashboard.jsx

import React, { useState, useEffect } from "react";
import { db } from "./firebaseConfig"; // 🔥 Importa a instância do Firestore já inicializada
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

// COMPONENTES BÁSICOS
import Tabs from "./Tabs";
import MonthlyHistoryTable from "./MonthlyHistoryTable";
import MemberProgressViewer from "./MemberProgressViewer";

// COMPONENTE PRINCIPAL
function FarmDashboard() {
  const [activeTab, setActiveTab] = useState("Controle de Entregas");
  const [memberNames, setMemberNames] = useState([]);
  const [totals, setTotals] = useState({});
  const [delivered, setDelivered] = useState({});
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [viewingMemberIndex, setViewingMemberIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const memberCount = memberNames.length;

  // 1️⃣ --- CARREGAR DADOS DO FIRESTORE ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const configRef = doc(db, "farm", "config");
        const snapshot = await getDoc(configRef);

        if (snapshot.exists()) {
          const data = snapshot.data();
          setMemberNames(data.memberNames || []);
          setTotals(data.totals || {});
          setDelivered(data.delivered || {});
          setMonthlyHistory(data.monthlyHistory || []);
        }
      } catch (err) {
        console.error("❌ Erro ao carregar dados:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // 2️⃣ --- SALVAR CONFIGURAÇÕES ---
  const saveConfig = async (updatedData) => {
    try {
      const configRef = doc(db, "farm", "config");
      await setDoc(configRef, updatedData, { merge: true });
      console.log("✅ Dados salvos no Firestore");
    } catch (err) {
      console.error("❌ Erro ao salvar:", err);
    }
  };

  // 3️⃣ --- FUNÇÕES DE MEMBROS ---
  const handleAddMember = (name) => {
    const updated = [...memberNames, name];
    setMemberNames(updated);
    saveConfig({ memberNames: updated });
  };

  const handleRemoveMember = (index) => {
    const updated = memberNames.filter((_, i) => i !== index);
    setMemberNames(updated);
    saveConfig({ memberNames: updated });
  };

  const handleRenameMember = (index, newName) => {
    const updated = [...memberNames];
    updated[index] = newName;
    setMemberNames(updated);
    saveConfig({ memberNames: updated });
  };

  // 4️⃣ --- CONTROLE DE ENTREGAS ---
  const handleDeliveryUpdate = (member, mat, value) => {
    const newDelivered = {
      ...delivered,
      [member]: { ...delivered[member], [mat]: value },
    };
    setDelivered(newDelivered);
    saveConfig({ delivered: newDelivered });
  };

  // 5️⃣ --- FECHAR MÊS ---
  const handleCloseMonth = async () => {
    if (!window.confirm("Deseja realmente fechar o mês e zerar entregas?")) return;

    const newHistoryEntry = {
      month: new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" }),
      data: delivered,
    };

    const updatedHistory = [...monthlyHistory, newHistoryEntry];
    setMonthlyHistory(updatedHistory);
    setDelivered({});

    await saveConfig({ delivered: {}, monthlyHistory: updatedHistory });
    alert("✅ Mês fechado e dados salvos no histórico!");
  };

  // 6️⃣ --- CALCULAR STATUS E RANKING ---
  const currentRanking = memberNames.map((name, idx) => {
    const userDeliveries = delivered[name] || {};
    const totalDelivered = Object.values(userDeliveries).reduce((a, b) => a + Number(b || 0), 0);
    const totalTarget = Object.values(totals).reduce((a, b) => a + Number(b || 0), 0);
    const pct = totalTarget ? Math.round((totalDelivered / totalTarget) * 100) : 0;
    const medal = pct >= 100 ? "🥇 Ouro" : pct >= 75 ? "🥈 Prata" : pct >= 50 ? "🥉 Bronze" : "⚪";
    return { index: idx, name, totalDelivered, totalTarget, pct, medal };
  });

  // 7️⃣ --- CONTEÚDOS DAS ABAS ---
  const ControlContent = (
    <div className="p-6 bg-white rounded-xl shadow-md border border-gray-200">
      <h2 className="text-2xl font-bold text-indigo-700 mb-4">📦 Controle de Entregas</h2>
      {memberNames.length === 0 ? (
        <p className="text-gray-500">Adicione membros na aba “Gerenciar Membros”.</p>
      ) : (
        memberNames.map((member, idx) => (
          <div key={idx} className="mb-6 border-b pb-4">
            <h3 className="text-lg font-semibold text-indigo-600 mb-2">{member}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.keys(totals).map((mat, i) => (
                <div key={i} className="bg-gray-50 p-3 rounded-lg shadow-sm">
                  <label className="block text-sm text-gray-700 mb-1">{mat}</label>
                  <input
                    type="number"
                    value={delivered?.[member]?.[mat] || ""}
                    onChange={(e) =>
                      handleDeliveryUpdate(member, mat, e.target.value ? Number(e.target.value) : 0)
                    }
                    className="w-full border rounded-md px-2 py-1 text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const RankingAndHistoryContent = (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 space-y-8">
      <h2 className="text-2xl font-bold mb-4 text-indigo-700 border-b pb-2">
        🏆 Ranking Atual e Histórico
      </h2>

      <div className="border border-green-300 rounded-xl p-4 bg-green-50/50">
        <h3 className="text-xl font-bold mb-4 text-green-700">Ranking Atual (Progresso)</h3>
        {currentRanking.length === 0 ? (
          <p className="text-sm text-red-500 font-medium">
            ⚠️ Adicione membros e configure metas para ver o ranking.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead>
                <tr className="bg-green-200">
                  <th className="px-3 py-2 text-left font-semibold text-green-800">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-green-800">Membro</th>
                  <th className="px-3 py-2 text-center font-semibold text-green-800">Medalha</th>
                  <th className="px-3 py-2 text-center font-semibold text-green-800">Entregue</th>
                  <th className="px-3 py-2 text-center font-semibold text-green-800">Meta</th>
                  <th className="px-3 py-2 text-center font-semibold text-green-800">% Concluído</th>
                </tr>
              </thead>
              <tbody>
                {currentRanking.map((item, idx) => (
                  <tr
                    key={item.index}
                    className={`border-t border-gray-100 ${
                      idx < 3 ? "bg-yellow-50 font-bold" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-3 py-2 text-center font-extrabold text-lg">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{item.name}</td>
                    <td className="px-3 py-2 text-center text-xl">{item.medal.split(" ")[0]}</td>
                    <td className="px-3 py-2 text-center text-green-700">{item.totalDelivered}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{item.totalTarget}</td>
                    <td className="px-3 py-2 text-center text-xl text-indigo-600 font-extrabold">
                      {item.pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-gray-200">
        <h3 className="text-xl font-bold mb-3 text-red-600">Ações de Controle Mensal</h3>
        <p className="mb-4 text-sm text-gray-600">
          Ao fechar o mês, o progresso é salvo no histórico e as entregas são zeradas.
        </p>
        <button
          onClick={handleCloseMonth}
          className="px-6 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition duration-300"
        >
          🗓️ Fechar Mês Atual
        </button>
      </div>

      <div className="pt-6 border-t border-gray-200">
        <h3 className="text-xl font-bold mb-4 text-indigo-600">Histórico de Meses Anteriores</h3>
        <MonthlyHistoryTable history={monthlyHistory} />
      </div>
    </div>
  );

  const MemberContent = (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-indigo-600">Gerenciar Membros</h2>

      <div className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-700 mb-2">Adicionar Novo Membro</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const newName = e.target.newMemberName.value.trim();
            if (newName) {
              handleAddMember(newName);
              e.target.newMemberName.value = "";
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            name="newMemberName"
            placeholder="Nome do novo membro"
            required
            className="flex-grow border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition duration-300"
          >
            Adicionar
          </button>
        </form>
      </div>

      <h3 className="font-semibold text-gray-700 mb-2">Membros Atuais ({memberCount})</h3>
      <div className="space-y-3">
        {memberNames.map((name, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
          >
            <span className="font-medium text-gray-800 flex-1">
              {index + 1}. {name}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setViewingMemberIndex(index)}
                className="text-sm px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition"
                title="Ver Progresso"
              >
                Ver
              </button>

              <input
                type="text"
                defaultValue={name}
                onBlur={(e) => handleRenameMember(index, e.target.value.trim() || name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                }}
                className="w-24 text-sm border border-gray-300 rounded px-2 py-1 text-center focus:ring-1 focus:ring-indigo-300"
                title="Renomear"
              />

              <button
                onClick={() => handleRemoveMember(index)}
                className="text-sm px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                title="Remover"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewingMemberIndex !== null && (
        <MemberProgressViewer
          memberIndex={viewingMemberIndex}
          memberNames={memberNames}
          delivered={delivered}
          setViewingMemberIndex={setViewingMemberIndex}
        />
      )}
    </div>
  );

  // Renderização principal
  const renderContent = () => {
    switch (activeTab) {
      case "Controle de Entregas":
        return ControlContent;
      case "Ranking e Histórico":
        return RankingAndHistoryContent;
      case "Gerenciar Membros":
        return MemberContent;
      default:
        return ControlContent;
    }
  };

  if (loading)
    return (
      <div className="text-center p-10 text-xl font-semibold text-indigo-700">
        Carregando dados...
      </div>
    );

  if (error)
    return (
      <div className="text-center p-10 bg-red-100 border border-red-400 text-red-700 font-semibold rounded-lg">
        <h1 className="text-2xl mb-2">⚠️ Erro Crítico</h1>
        <p>Falha no Firebase: {error}</p>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-indigo-800 mb-6 border-b-2 border-indigo-200 pb-2">
        Controle de Farm (Sincronizado)
      </h1>
      <Tabs
        tabs={["Controle de Entregas", "Ranking e Histórico", "Gerenciar Membros"]}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      {renderContent()}
    </div>
  );
}

export default FarmDashboard;
