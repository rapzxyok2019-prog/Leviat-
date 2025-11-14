import React, { useState, useEffect, useMemo, useCallback } from 'react'; 
import { initializeApp } from 'firebase/app'; 
import { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth'; 
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, addDoc, serverTimestamp, orderBy } from 'firebase/firestore'; 

// Configuração do Firebase
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB2mlLKLqVwvx7FMq8qLkYAwHLkjljDYIU",
  authDomain: "controle-de-farm-leviata.firebaseapp.com",
  projectId: "controle-de-farm-leviata",
  storageBucket: "controle-de-farm-leviata.firebasestorage.app",
  messagingSenderId: "736608761330",
  appId: "1:736608761330:web:3e7193c697eea4ff7e676b"
};

// Inicialização do Firebase
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

// ESTRUTURA SIMPLIFICADA - Paths diretos
const PRODUCTION_DOC_REF = doc(db, 'farm_data', 'production');
const MEMBERS_DOC_REF = doc(db, 'farm_data', 'members');
const DELIVERED_DOC_REF = doc(db, 'farm_data', 'delivered');
const HISTORY_COLLECTION_REF = collection(db, 'farm_history');

// --- Receitas ---
const RECIPES = {
  Colete: { Borracha: 10, "Plástico": 10, Alumínio: 20, Ferro: 20, Tecido: 1 },
  Algema: { Borracha: 20, "Plástico": 20, Alumínio: 25, Cobre: 25, Ferro: 30 },
  Capuz: { Borracha: 10, "Plástico": 10, Tecido: 1 },
  "Flipper MK3": { Alumínio: 25, Ferro: 25, Cobre: 25, "Emb. Plástica": 25, Titânio: 1 }
};

// --- Hooks de Sincronização e Estado ---
const useSharedData = () => {
  const [production, setProductionState] = useState({ Colete: '200', Algema: '100', Capuz: '50', "Flipper MK3": '20' });
  const [memberNames, setMemberNamesState] = useState(['Membro 1', 'Membro 2', 'Membro 3']);
  const [delivered, setDeliveredState] = useState({});
  const [history, setHistory] = useState([]);
  const [isDbReady, setIsDbReady] = useState(false);
  const [userId, setUserId] = useState(null);

  // Efeito 1: Autenticação
  useEffect(() => {
    const setupAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
        setUserId(auth.currentUser.uid);
      } catch (error) {
        console.error("Erro na autenticação:", error);
        setUserId('local-user-' + Date.now());
      }
    };
    setupAuth();
  }, []);

  // Efeito 2: Sincronização em Tempo Real
  useEffect(() => {
    if (!userId) return;

    console.log("Iniciando sincronização Firebase...");
    
    // Listener Produção
    const unsubProduction = onSnapshot(PRODUCTION_DOC_REF, (docSnap) => {
      if (docSnap.exists() && docSnap.data().production) {
        setProductionState(docSnap.data().production);
      } else if (!docSnap.exists()) {
        setDoc(PRODUCTION_DOC_REF, { production });
      }
    });

    // Listener Membros
    const unsubMembers = onSnapshot(MEMBERS_DOC_REF, (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().memberNames)) {
        setMemberNamesState(docSnap.data().memberNames);
      } else if (!docSnap.exists()) {
        setDoc(MEMBERS_DOC_REF, { memberNames });
      }
    });

    // Listener Entregas
    const unsubDelivered = onSnapshot(DELIVERED_DOC_REF, (docSnap) => {
      if (docSnap.exists() && typeof docSnap.data().delivered === 'object') {
        setDeliveredState(docSnap.data().delivered);
      } else if (!docSnap.exists()) {
        setDoc(DELIVERED_DOC_REF, { delivered: {} });
      }
    });

    // Listener Histórico
    const historyQuery = query(HISTORY_COLLECTION_REF, orderBy("date", "desc"));
    const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
      const historyList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(historyList);
    });

    setIsDbReady(true);

    return () => {
      unsubProduction();
      unsubMembers();
      unsubDelivered();
      unsubHistory();
    };
  }, [userId]);

  // Funções de Escrita
  const updateProduction = useCallback((newProduction) => {
    updateDoc(PRODUCTION_DOC_REF, { production: newProduction });
  }, []);

  const updateMemberNames = useCallback((newNames) => {
    updateDoc(MEMBERS_DOC_REF, { memberNames: newNames });
  }, []);

  const updateDelivered = useCallback((newDelivered) => {
    updateDoc(DELIVERED_DOC_REF, { delivered: newDelivered });
  }, []);

  return { production, updateProduction, memberNames, updateMemberNames, delivered, updateDelivered, history, isDbReady };
};

// --- Funções de Cálculo ---
function sumMaterials(production) {
  const totals = {};
  Object.entries(production).forEach(([product, qty]) => {
    const recipe = RECIPES[product] || {};
    Object.entries(recipe).forEach(([mat, per]) => {
      const numericQty = Number(qty) || 0;
      totals[mat] = (totals[mat] || 0) + per * numericQty;
    });
  });
  return totals;
}

function ceilDivide(a, b) {
  return Math.ceil(a / b);
}

function calculateRanking(memberNames, perMember, delivered) {
  if (memberNames.length === 0 || Object.keys(perMember).length === 0) return [];
  return memberNames.map((name, index) => {
    let totalTarget = 0;
    let totalDelivered = 0;
    Object.keys(perMember).forEach(mat => {
      const target = perMember[mat] || 0;
      const deliveredQty = Number(delivered[mat]?.[index]) || 0;
      totalTarget += target;
      totalDelivered += deliveredQty;
    });
    const percentage = totalTarget > 0 ? (totalDelivered / totalTarget) : 0;
    const pct = Math.min(100, Math.round(percentage * 100));
    let medal = 'Nenhuma';
    if (pct >= 100) medal = '🥇 Ouro';
    else if (pct >= 80) medal = '🥈 Prata';
    else if (pct >= 50) medal = '🥉 Bronze';
    return { name, index, totalTarget, totalDelivered, pct, medal };
  }).sort((a, b) => b.pct - a.pct);
}

// --- Componente de Tabs ---
function Tabs({ tabs, activeTab, setActiveTab }) {
  const icons = {
    'Configuração e Metas': '⚙️',
    'Controle de Entregas': '📦', 
    'Resumo e Status': '📈',
    'Ranking e Histórico': '🏆',
    'Gerenciar Membros': '👥'
  };
  
  return (
    <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-300 pb-4">
      {tabs.map((tab, index) => (
        <button
          key={index}
          onClick={() => setActiveTab(tab)}
          className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${
            activeTab === tab 
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg' 
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm hover:shadow-md'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="text-lg">{icons[tab] || ''}</span>
            {tab}
          </span>
        </button>
      ))}
    </div>
  );
}

// --- Componente Principal ---
function FarmDashboard() {
  const TABS = ['Configuração e Metas', 'Controle de Entregas', 'Resumo e Status', 'Ranking e Histórico', 'Gerenciar Membros'];
  const { production, updateProduction, memberNames, updateMemberNames, delivered, updateDelivered, history, isDbReady } = useSharedData();
  const [activeTab, setActiveTab] = useState('Controle de Entregas');
  const [viewingMemberIndex, setViewingMemberIndex] = useState(null);
  const memberCount = memberNames.length;

  // Cálculos Memoizados
  const totals = useMemo(() => sumMaterials(production), [production]);
  const perMember = useMemo(() => {
    if(memberCount === 0) return {};
    const r={};
    Object.entries(totals).forEach(([m,t])=>r[m]=ceilDivide(t,memberCount));
    return r;
  }, [totals, memberCount]);
  
  const currentRanking = useMemo(() => calculateRanking(memberNames, perMember, delivered), [memberNames, perMember, delivered]);

  // Efeito de Ajuste da Estrutura 'delivered'
  useEffect(() => {
    if (!isDbReady) return;
    
    const getNextDelivered = (prev) => {
      const next = {};
      const currentMaterials = Object.keys(totals);
      currentMaterials.forEach(mat => {
        const previousDeliveries = prev[mat] || [];
        next[mat] = Array.from({length: memberCount}, (_, i) => previousDeliveries[i] ?? '');
      });
      return next;
    };

    const currentKeys = Object.keys(delivered);
    const expectedLength = delivered[currentKeys[0]]?.length ?? 0;
    
    if (memberCount !== expectedLength || currentKeys.length !== Object.keys(totals).length) {
      const nextDelivered = getNextDelivered(delivered);
      updateDelivered(nextDelivered);
    }
    
    if (viewingMemberIndex !== null && viewingMemberIndex >= memberCount) {
      setViewingMemberIndex(null);
    }
  }, [memberCount, totals, delivered, updateDelivered, viewingMemberIndex, isDbReady]);

  // Funções de Manipulação de Dados
  const handleUpdateProduction = useCallback((product, value) => {
    const sanitizedValue = value === '' || (!isNaN(Number(value)) && Number(value) >= 0) ? value : production[product];
    updateProduction({...production, [product]: sanitizedValue});
  }, [production, updateProduction]);

  const handleUpdateDelivered = useCallback((material, memberIndex, value) => {
    const valueToStore = (value === '' || (value === '0') || (!isNaN(Number(value)) && Number(value) >= 0)) ? value : (delivered[material]?.[memberIndex] ?? '');
    const next = {...delivered};
    next[material] = next[material] ? [...next[material]] : Array(memberCount).fill('');
    if (memberIndex < memberCount) {
      next[material][memberIndex] = valueToStore;
      updateDelivered(next);
    }
  }, [delivered, memberCount, updateDelivered]);

  const getMaterialTotalDelivered = useCallback((mat) => {
    return (delivered[mat] || []).reduce((a,b)=>a+(Number(b)||0),0);
  }, [delivered]);

  const getStatusForMemberDelivery = useCallback((mat, memberIndex) => {
    const memberTarget = perMember[mat] || 0;
    const memberDelivered = Number(delivered[mat]?.[memberIndex]) || 0;
    if(memberTarget === 0) return {label:"N/A", color:"from-gray-400 to-gray-500"};
    if(memberDelivered >= memberTarget) return {label:"Atingida",color:"from-green-500 to-green-600"};
    if(memberDelivered >= memberTarget * 0.5) return {label:"Parcial",color:"from-amber-400 to-amber-500"};
    return {label:"Pendente",color:"from-red-500 to-red-600"};
  }, [perMember, delivered]);

  const getStatusForTotalDelivery = useCallback((mat) => {
    const deliveredTot = getMaterialTotalDelivered(mat);
    const targetTotal = totals[mat] || 0;
    if(deliveredTot>=targetTotal) return {label:"Atingida",color:"from-green-500 to-green-600"};
    if(deliveredTot>=targetTotal*0.5) return {label:"Parcial",color:"from-amber-400 to-amber-500"};
    return {label:"Pendente",color:"from-red-500 to-red-600"};
  }, [getMaterialTotalDelivered, totals]);

  const getMemberTotalDelivered = useCallback((memberIndex) => {
    return Object.keys(delivered).reduce((sum, mat) => sum + (Number(delivered[mat]?.[memberIndex]) || 0), 0);
  }, [delivered]);

  // Função para Fechar o Mês
  async function handleCloseMonth() {
    if (memberCount === 0) {
      alert("Adicione membros primeiro.");
      return;
    }
    
    const totalMetas = Object.values(totals).reduce((a,b) => a+b, 0);
    if (totalMetas === 0) {
      alert("Defina metas na aba 'Configuração' antes de fechar o mês.");
      return;
    }

    if (!window.confirm("ATENÇÃO: Fechar o mês atual? Isso salvará o progresso e ZERARÁ todos os campos de 'Controle de Entregas'.")) {
      return;
    }

    const now = new Date();
    const monthYear = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    
    const monthData = {
      label: monthYear.charAt(0).toUpperCase() + monthYear.slice(1),
      date: serverTimestamp(),
      members: currentRanking.map(r => ({...r})),
    };

    try {
      await addDoc(HISTORY_COLLECTION_REF, monthData);
      
      const nextDelivered = {};
      Object.keys(totals).forEach(mat => {
        nextDelivered[mat] = Array(memberCount).fill('');
      });
      await updateDelivered(nextDelivered);
      
      alert(`Mês de ${monthData.label} fechado com sucesso!`);
      setActiveTab('Controle de Entregas');
    } catch (e) {
      console.error("Erro ao fechar o mês:", e);
      alert("Erro ao fechar o mês. Verifique o console.");
    }
  }

  // Funções de Gerenciamento de Membros
  const handleAddMember = (name) => {
    updateMemberNames([...memberNames, name]);
  };

  const handleRenameMember = (index, newName) => {
    updateMemberNames(memberNames.map((n, i) => (i === index ? newName : n)));
  };

  const handleRemoveMember = async (indexToRemove) => {
    if (!window.confirm(`Remover ${memberNames[indexToRemove]}?`)) return;
    
    const nextMemberNames = memberNames.filter((_, i) => i !== indexToRemove);
    await updateMemberNames(nextMemberNames);
    
    const nextDelivered = {};
    Object.keys(delivered).forEach(mat => {
      nextDelivered[mat] = delivered[mat].filter((_, i) => i !== indexToRemove);
      nextDelivered[mat] = Array.from({length: nextMemberNames.length}, (_, i) => nextDelivered[mat][i] ?? '');
    });
    await updateDelivered(nextDelivered);
    setViewingMemberIndex(null);
  };

  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md text-center border border-white/20">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Conectando ao Painel Colaborativo...</h2>
          <p className="text-gray-600">Sincronizando dados em tempo real com o Firestore.</p>
        </div>
      </div>
    );
  }

  // --- Componentes de Conteúdo ---
  
  // Componente de Visualização de Progresso Individual
  const MemberProgressViewer = ({ memberIndex }) => {
    const memberName = memberNames[memberIndex];
    if (memberIndex === null || memberIndex >= memberNames.length) return null;
    
    const individualProgress = Object.keys(perMember).reduce((acc, mat) => {
      const target = perMember[mat] || 0;
      const deliveredQty = Number(delivered[mat]?.[memberIndex]) || 0;
      acc.target += target;
      acc.delivered += deliveredQty;
      return acc;
    }, { target: 0, delivered: 0 });
    
    const pct = individualProgress.target > 0 ? Math.min(100, Math.round((individualProgress.delivered / individualProgress.target) * 100)) : 0;

    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 mt-6 border border-white/20">
        <h3 className="text-xl font-bold text-gray-800 mb-4">📊 Progresso Individual de {memberName}</h3>
        
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progresso Geral</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 shadow-inner">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-4 rounded-full transition-all duration-700 shadow-md" 
              style={{width: `${pct}%`}}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-3 text-center">
            <strong className="text-green-600">{individualProgress.delivered}</strong> entregues de <strong className="text-blue-600">{individualProgress.target}</strong> unidades
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700 mb-4">🎯 Status por Material:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.keys(perMember).map(mat => {
              const status = getStatusForMemberDelivery(mat, memberIndex);
              const deliveredQty = Number(delivered[mat]?.[memberIndex]) || 0;
              return (
                <div key={mat} className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-gray-800 text-sm">{mat}</span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Meta: {perMember[mat]}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{deliveredQty} / {perMember[mat]}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${status.color} text-white`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={() => setViewingMemberIndex(null)} className="mt-6 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 transform hover:scale-105 shadow-lg w-full">
          Fechar Visualização
        </button>
      </div>
    );
  };

  // Conteúdo da Aba 1: Configuração e Metas
  const ConfigContent = (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">⚙️ Configuração de Produção</h2>
      <p className="text-gray-600 mb-8 text-lg">As metas são instantaneamente compartilhadas e calculadas para todos os membros.</p>
      
      <div className="space-y-6 mb-10">
        {Object.keys(production).map(prod => (
          <div key={prod} className="flex items-center gap-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 shadow-sm hover:shadow-md transition-shadow">
            <span className="font-semibold text-gray-700 min-w-[140px] text-lg">{prod}</span>
            <input
              type="text"
              value={production[prod]}
              onChange={(e) => handleUpdateProduction(prod, e.target.value)}
              className="flex-grow border-2 border-gray-300 rounded-xl px-4 py-3 text-right text-lg font-semibold focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition duration-200 shadow-inner"
            />
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-8 border border-blue-200 shadow-sm">
        <h3 className="text-2xl font-bold text-gray-800 mb-6">🎯 Metas por Pessoa (Total: {memberCount} Membros)</h3>
        {memberCount > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(perMember).map(mat => (
              <div key={mat} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <strong className="text-gray-800">{mat}</strong>: <span className="text-blue-600 font-bold text-lg">{perMember[mat]}</span> unidades
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <span className="text-amber-600 font-semibold text-lg">⚠️ Adicione membros na aba 'Gerenciar Membros' para calcular as metas!</span>
          </div>
        )}
      </div>
    </div>
  );

  // Conteúdo da Aba 2: Controle de Entregas
  const ControlContent = (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">📦 Registro de Entregas por Membro</h2>
      <p className="text-gray-600 mb-8 text-lg"><strong className="text-green-600">As alterações nesta tabela são visíveis para toda a equipe em tempo real.</strong></p>

      {memberCount === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl border border-gray-200">
          <div className="text-4xl mb-4">👥</div>
          <p className="text-xl">Por favor, adicione membros na aba "Gerenciar Membros" para começar o controle de entregas.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                <th className="border border-blue-400 p-4 text-left font-bold text-lg">Material</th>
                <th className="border border-blue-400 p-4 text-center font-bold text-lg">Meta / Membro</th>
                {memberNames.map((n, i) => (
                  <th key={i} className="border border-blue-400 p-4 text-center font-bold text-lg bg-blue-600">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(perMember).map(mat => (
                <tr key={mat} className="hover:bg-blue-50 transition-colors">
                  <td className="border border-gray-200 p-4 font-semibold text-gray-700 bg-gray-50">{mat}</td>
                  <td className="border border-gray-200 p-4 text-center font-bold text-blue-600 bg-blue-50">
                    {perMember[mat]}
                  </td>
                  {memberNames.map((_, mi) => (
                    <td key={mi} className="border border-gray-200 p-3">
                      <input
                        type="text"
                        value={delivered[mat]?.[mi] || ''}
                        onChange={(e) => handleUpdateDelivered(mat, mi, e.target.value)}
                        className="w-full text-right px-3 py-2 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition duration-150 shadow-inner"
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold">
                <td className="border border-green-400 p-4">TOTAL ENTREGUE</td>
                <td className="border border-green-400 p-4 text-center">-</td>
                {memberNames.map((_, mi) => (
                  <td key={mi} className="border border-green-400 p-4 text-center bg-green-600 text-lg">
                    {getMemberTotalDelivered(mi)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Conteúdo da Aba 3: Resumo e Status
  const StatusContent = (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">📈 Progresso Geral da Semana</h2>
      <p className="text-gray-600 mb-8 text-lg">Visão consolidada do total de material entregue pela equipe.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {Object.keys(totals).map(mat => {
          const deliveredTot = getMaterialTotalDelivered(mat);
          const pct = Math.min(100, totals[mat] > 0 ? Math.round((deliveredTot / totals[mat]) * 100) : 0);
          const status = getStatusForTotalDelivery(mat);
          
          return (
            <div key={mat} className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold text-gray-800">{mat}</h3>
                <span className={`px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r ${status.color} shadow-md`}>
                  {status.label}
                </span>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progresso</span>
                  <span className="font-bold">{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 shadow-inner">
                  <div 
                    className={`h-4 rounded-full bg-gradient-to-r ${status.color} transition-all duration-1000 shadow-md`}
                    style={{width: `${pct}%`}}
                  ></div>
                </div>
              </div>
              
              <div className="text-center bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-200">
                <p className="text-sm text-gray-700">
                  Total Entregue: <strong className="text-green-600 text-lg">{deliveredTot}</strong> • Meta Total: <strong className="text-blue-600 text-lg">{totals[mat]}</strong>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Componente para Tabela de Histórico
  const MonthlyHistoryTable = ({ history }) => {
    if (history.length === 0) {
      return <div className="text-gray-500 text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl border border-gray-200">
        <div className="text-4xl mb-4">📅</div>
        <p className="text-xl">Nenhum mês anterior encontrado. Feche o mês atual para iniciar o histórico.</p>
      </div>;
    }

    return (
      <div className="space-y-8">
        {history.map(monthData => (
          <div key={monthData.id} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text">{monthData.label}</h3>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-600 to-gray-700 text-white">
                    <th className="border border-gray-500 p-4 text-left font-bold">#</th>
                    <th className="border border-gray-500 p-4 text-left font-bold">Membro</th>
                    <th className="border border-gray-500 p-4 text-center font-bold">Entregue</th>
                    <th className="border border-gray-500 p-4 text-center font-bold">Meta</th>
                    <th className="border border-gray-500 p-4 text-center font-bold">% Concluído</th>
                    <th className="border border-gray-500 p-4 text-center font-bold">Medalha</th>
                  </tr>
                </thead>
                <tbody>
                  {monthData.members.map((member, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="border border-gray-300 p-4 font-semibold">{index + 1}</td>
                      <td className="border border-gray-300 p-4 font-semibold text-gray-800">{member.name}</td>
                      <td className="border border-gray-300 p-4 text-center">{member.totalDelivered}</td>
                      <td className="border border-gray-300 p-4 text-center">{member.totalTarget}</td>
                      <td className="border border-gray-300 p-4 text-center font-bold">{member.pct}%</td>
                      <td className="border border-gray-300 p-4 text-center text-2xl">{member.medal.split(' ')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Conteúdo da Aba 4: Ranking e Histórico
  const RankingAndHistoryContent = (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">🏆 Ranking Atual e Histórico</h2>

      <div className="mb-12">
        <h3 className="text-2xl font-semibold text-gray-700 mb-6">📊 Ranking Atual (Progresso Individual)</h3>
        
        {currentRanking.length === 0 || memberCount === 0 || Object.values(totals).every(t => t === 0) ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
            <span className="text-amber-600 font-semibold text-lg">⚠️ Adicione membros e configure metas para visualizar o ranking.</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-lg">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <th className="border border-amber-400 p-4 text-left font-bold text-lg">#</th>
                  <th className="border border-amber-400 p-4 text-left font-bold text-lg">Membro</th>
                  <th className="border border-amber-400 p-4 text-center font-bold text-lg">Medalha</th>
                  <th className="border border-amber-400 p-4 text-center font-bold text-lg">Entregue</th>
                  <th className="border border-amber-400 p-4 text-center font-bold text-lg">Meta</th>
                  <th className="border border-amber-400 p-4 text-center font-bold text-lg">% Concluído</th>
                </tr>
              </thead>
              <tbody>
                {currentRanking.map((item, idx) => (
                  <tr key={idx} className="hover:bg-amber-50 transition-colors">
                    <td className="border border-amber-200 p-4 font-bold text-lg">{idx + 1}</td>
                    <td className="border border-amber-200 p-4 font-semibold text-gray-800">{item.name}</td>
                    <td className="border border-amber-200 p-4 text-center text-2xl">{item.medal.split(' ')[0]}</td>
                    <td className="border border-amber-200 p-4 text-center font-semibold">{item.totalDelivered}</td>
                    <td className="border border-amber-200 p-4 text-center font-semibold">{item.totalTarget}</td>
                    <td className="border border-amber-200 p-4 text-center font-bold text-lg">{item.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-12">
        <h3 className="text-2xl font-semibold text-gray-700 mb-6">🗓️ Ações de Controle Mensal</h3>
        <p className="text-gray-600 mb-6 text-lg">Ao fechar o mês, o progresso atual é salvo no histórico do Firestore e todos os campos de entrega são zerados.</p>
        <button
          onClick={handleCloseMonth}
          disabled={memberCount === 0 || Object.values(totals).every(t => t === 0)}
          className="px-8 py-4 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold text-lg rounded-2xl hover:from-red-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed"
        >
          🗓️ Fechar Mês Atual e Zerar Entregas
        </button>
      </div>

      <div>
        <h3 className="text-2xl font-semibold text-gray-700 mb-6">📚 Histórico de Meses Anteriores</h3>
        <MonthlyHistoryTable history={history} />
      </div>
    </div>
  );

  // Conteúdo da Aba 5: Gerenciar Membros
  const MemberContent = (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">👥 Gerenciar Membros da Equipe</h2>
      <p className="text-gray-600 mb-8 text-lg"><strong className="text-green-600">Qualquer alteração nesta lista é instantaneamente compartilhada com todos os usuários.</strong></p>

      {/* Adicionar Membro */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-8 mb-10 border border-blue-200 shadow-sm">
        <h3 className="text-2xl font-bold text-gray-800 mb-6">➕ Adicionar Novo Membro</h3>
        <form onSubmit={(e) => {
          e.preventDefault();
          const newName = e.target.newMemberName.value.trim();
          if (newName) {
            handleAddMember(newName);
            e.target.newMemberName.value = '';
          }
        }} className="flex gap-4">
          <input
            type="text"
            name="newMemberName"
            placeholder="Digite o nome do membro..."
            className="flex-grow border-2 border-gray-300 rounded-xl px-6 py-4 text-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition duration-200 shadow-inner"
          />
          <button type="submit" className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold text-lg rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 transform hover:scale-105 shadow-lg">
            Adicionar
          </button>
        </form>
      </div>

      {/* Lista de Membros */}
      <div>
        <h3 className="text-2xl font-bold text-gray-800 mb-6">📋 Membros Atuais ({memberCount})</h3>
        <div className="space-y-4">
          {memberNames.map((name, index) => (
            <div key={index} className="flex items-center gap-4 p-6 bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300">
              <span className="font-bold text-gray-700 min-w-[40px] text-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full w-10 h-10 flex items-center justify-center">
                {index + 1}
              </span>
              <span className="flex-grow font-semibold text-gray-800 text-lg">{name}</span>
              
              <button
                onClick={() => setViewingMemberIndex(index)}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 transform hover:scale-105 shadow-md"
                title="Ver Progresso"
              >
                📊 Ver Progresso
              </button>
              
              <input
                type="text"
                defaultValue={name}
                onBlur={(e) => handleRenameMember(index, e.target.value.trim() || name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                className="w-32 text-lg border-2 border-gray-300 rounded-xl px-4 py-2 text-center focus:ring-2 focus:ring-indigo-300 shadow-inner"
                title="Clique para renomear"
              />
              
              <button
                onClick={() => handleRemoveMember(index)}
                className="px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold rounded-xl hover:from-red-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-md"
                title="Remover Membro"
              >
                🗑️ Remover
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Visualizador de Progresso Individual */}
      {viewingMemberIndex !== null && <MemberProgressViewer memberIndex={viewingMemberIndex} />}
    </div>
  );

  // Renderiza o Conteúdo da Aba Ativa
  const renderContent = () => {
    switch (activeTab) {
      case 'Configuração e Metas': return ConfigContent;
      case 'Controle de Entregas': return ControlContent;
      case 'Resumo e Status': return StatusContent;
      case 'Ranking e Histórico': return RankingAndHistoryContent;
      case 'Gerenciar Membros': return MemberContent;
      default: return ControlContent;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-indigo-600 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">🏭 Controle de Farm Leviata</h1>
          <p className="text-blue-100 text-xl font-semibold">Sistema colaborativo em tempo real</p>
        </div>

        <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
        {renderContent()}
        
        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t border-white/20">
          <p className="text-white/70 text-sm">Sistema sincronizado em tempo real • Dados salvos na nuvem</p>
        </div>
      </div>
    </div>
  );
}

export default FarmDashboard;
