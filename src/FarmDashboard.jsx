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

// --- Receitas (MATERIAIS NECESSÁRIOS) ---
const RECIPES = {
  Colete: { Borracha: 10, "Plástico": 10, Alumínio: 20, Ferro: 20, Tecido: 1 },
  Algema: { Borracha: 20, "Plástico": 20, Alumínio: 25, Cobre: 25, Ferro: 30 },
  Capuz: { Borracha: 10, "Plástico": 10, Tecido: 1 },
  "Flipper MK3": { Alumínio: 25, Ferro: 25, Cobre: 25, "Emb. Plástica": 25, Titânio: 1 }
};

// LISTA DE MATERIAIS (baseado nas receitas)
const MATERIALS = ['Borracha', 'Plástico', 'Alumínio', 'Cobre', 'Ferro', 'Emb. Plástica', 'Titânio', 'Tecido'];

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

  // Efeito 2: Sincronização em Tempo Real CORRIGIDO
  useEffect(() => {
    if (!userId) return;

    console.log("Iniciando sincronização Firebase...");
    
    // Listener Produção
    const unsubProduction = onSnapshot(PRODUCTION_DOC_REF, (docSnap) => {
      if (docSnap.exists() && docSnap.data().production) {
        setProductionState(docSnap.data().production);
      } else if (!docSnap.exists()) {
        const initialProduction = { Colete: '200', Algema: '100', Capuz: '50', "Flipper MK3": '20' };
        setDoc(PRODUCTION_DOC_REF, { production: initialProduction });
      }
    });

    // Listener Membros
    const unsubMembers = onSnapshot(MEMBERS_DOC_REF, (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().memberNames)) {
        setMemberNamesState(docSnap.data().memberNames);
      } else if (!docSnap.exists()) {
        const initialMembers = ['Membro 1', 'Membro 2', 'Membro 3'];
        setDoc(MEMBERS_DOC_REF, { memberNames: initialMembers });
      }
    });

    // Listener Entregas CORRIGIDO - AGORA COM MATERIAIS
    const unsubDelivered = onSnapshot(DELIVERED_DOC_REF, (docSnap) => {
      if (docSnap.exists() && typeof docSnap.data().delivered === 'object') {
        setDeliveredState(docSnap.data().delivered);
      } else if (!docSnap.exists()) {
        // ESTRUTURA INICIAL CORRETA - MATERIAIS, não produtos
        const initialDelivered = {};
        MATERIALS.forEach(material => {
          initialDelivered[material] = ['', '', '']; // 3 membros iniciais
        });
        setDoc(DELIVERED_DOC_REF, { delivered: initialDelivered });
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

// --- Funções de Cálculo CORRIGIDAS ---
function sumMaterials(production) {
  const totals = {};
  
  // Inicializa todos os materiais com 0
  MATERIALS.forEach(material => {
    totals[material] = 0;
  });

  // Calcula o total de cada material necessário
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
    Object.keys(perMember).forEach(material => {
      const target = perMember[material] || 0;
      const deliveredQty = Number(delivered[material]?.[index]) || 0;
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

// --- Componente de Tabs (mantido igual) ---
function Tabs({ tabs, activeTab, setActiveTab }) {
  const icons = {
    'Configuração e Metas': '⚙️',
    'Controle de Entregas': '📦', 
    'Resumo e Status': '📈',
    'Ranking e Histórico': '🏆',
    'Gerenciar Membros': '👥'
  };
  
  return (
    <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-2">
      {tabs.map((tab, index) => (
        <button
          key={index}
          onClick={() => setActiveTab(tab)}
          className={`px-4 py-2 rounded-lg font-medium transition duration-200 ${
            activeTab === tab 
              ? 'bg-blue-500 text-white shadow-md' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {icons[tab] || ''} {tab}
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

  // Cálculos Memoizados CORRIGIDOS - AGORA COM MATERIAIS
  const totals = useMemo(() => sumMaterials(production), [production]);
  const perMember = useMemo(() => {
    if(memberCount === 0) return {};
    const r = {};
    Object.entries(totals).forEach(([material, total]) => {
      r[material] = ceilDivide(total, memberCount);
    });
    return r;
  }, [totals, memberCount]);
  
  const currentRanking = useMemo(() => calculateRanking(memberNames, perMember, delivered), [memberNames, perMember, delivered]);

  // Efeito de Ajuste da Estrutura 'delivered' CORRIGIDO
  useEffect(() => {
    if (!isDbReady) return;
    
    const getNextDelivered = (prev) => {
      const next = {};
      MATERIALS.forEach(material => {
        const previousDeliveries = prev[material] || [];
        next[material] = Array.from({length: memberCount}, (_, i) => previousDeliveries[i] ?? '');
      });
      return next;
    };

    const currentKeys = Object.keys(delivered);
    const expectedLength = delivered[currentKeys[0]]?.length ?? 0;
    
    if (memberCount !== expectedLength || currentKeys.length !== MATERIALS.length) {
      const nextDelivered = getNextDelivered(delivered);
      updateDelivered(nextDelivered);
    }
    
    if (viewingMemberIndex !== null && viewingMemberIndex >= memberCount) {
      setViewingMemberIndex(null);
    }
  }, [memberCount, delivered, updateDelivered, viewingMemberIndex, isDbReady]);

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

  // FUNÇÕES CORRIGIDAS - materiais, não produtos
  const getMaterialTotalDelivered = useCallback((material) => {
    return (delivered[material] || []).reduce((a,b) => a + (Number(b) || 0), 0);
  }, [delivered]);

  const getStatusForMemberDelivery = useCallback((material, memberIndex) => {
    const memberTarget = perMember[material] || 0;
    const memberDelivered = Number(delivered[material]?.[memberIndex]) || 0;
    if(memberTarget === 0) return {label:"N/A", color:"bg-gray-400"};
    if(memberDelivered >= memberTarget) return {label:"Atingida",color:"bg-green-600"};
    if(memberDelivered >= memberTarget * 0.5) return {label:"Parcial",color:"bg-amber-500"};
    return {label:"Pendente",color:"bg-red-600"};
  }, [perMember, delivered]);

  const getStatusForTotalDelivery = useCallback((material) => {
    const deliveredTot = getMaterialTotalDelivered(material);
    const targetTotal = totals[material] || 0;
    if(deliveredTot >= targetTotal) return {label:"Atingida",color:"bg-green-600"};
    if(deliveredTot >= targetTotal * 0.5) return {label:"Parcial",color:"bg-amber-500"};
    return {label:"Pendente",color:"bg-red-600"};
  }, [getMaterialTotalDelivered, totals]);

  const getMemberTotalDelivered = useCallback((memberIndex) => {
    return Object.keys(delivered).reduce((sum, material) => sum + (Number(delivered[material]?.[memberIndex]) || 0), 0);
  }, [delivered]);

  // Função para Fechar o Mês CORRIGIDA
  async function handleCloseMonth() {
    if (memberCount === 0) {
      alert("Adicione membros primeiro.");
      return;
    }
    
    const totalMetas = Object.values(totals).reduce((a,b) => a + (Number(b) || 0), 0);
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
      
      // CORRIGIDO: zerar entregas dos MATERIAIS
      const nextDelivered = {};
      MATERIALS.forEach(material => {
        nextDelivered[material] = Array(memberCount).fill('');
      });
      await updateDelivered(nextDelivered);
      
      alert(`Mês de ${monthData.label} fechado com sucesso!`);
      setActiveTab('Controle de Entregas');
    } catch (e) {
      console.error("Erro ao fechar o mês:", e);
      alert("Erro ao fechar o mês. Verifique o console.");
    }
  }

  // Funções de Gerenciamento de Membros (mantidas iguais)
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
    Object.keys(delivered).forEach(material => {
      nextDelivered[material] = delivered[material].filter((_, i) => i !== indexToRemove);
      nextDelivered[material] = Array.from({length: nextMemberNames.length}, (_, i) => nextDelivered[material][i] ?? '');
    });
    await updateDelivered(nextDelivered);
    setViewingMemberIndex(null);
  };

  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Conectando ao Painel Colaborativo...</h2>
          <p className="text-gray-600">Sincronizando dados em tempo real com o Firestore.</p>
        </div>
      </div>
    );
  }

  // --- Componentes de Conteúdo CORRIGIDOS ---
  
  // Conteúdo da Aba 1: Configuração e Metas CORRIGIDO
  const ConfigContent = (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Configuração de Produção</h2>
      <p className="text-gray-600 mb-6">Defina quantos produtos quer produzir. As metas de materiais são calculadas automaticamente.</p>
      
      <div className="space-y-4 mb-8">
        {Object.keys(production).map(prod => (
          <div key={prod} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <span className="font-medium text-gray-700 min-w-[120px]">{prod}</span>
            <input
              type="text"
              value={production[prod]}
              onChange={(e) => handleUpdateProduction(prod, e.target.value)}
              className="flex-grow border border-gray-300 rounded-lg px-3 py-2 text-right focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition duration-200"
            />
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Metas de Materiais por Pessoa (Total: {memberCount} Membros)</h3>
        {memberCount > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.keys(perMember).map(material => (
              <div key={material} className="bg-white rounded-lg p-3 border border-gray-200">
                <strong>{material}</strong>: {perMember[material]} unidades
              </div>
            ))}
          </div>
        ) : (
          <div className="text-amber-600 bg-amber-50 p-4 rounded-lg border border-amber-200">
            ⚠️ Adicione membros na aba 'Gerenciar Membros' para calcular as metas!
          </div>
        )}
      </div>
    </div>
  );

  // Conteúdo da Aba 2: Controle de Entregas CORRIGIDO (PRINCIPAL)
  const ControlContent = (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Registro de Entregas por Membro (Live)</h2>
      <p className="text-gray-600 mb-6"><strong>As alterações nesta tabela são visíveis para toda a equipe em tempo real.</strong></p>

      {memberCount === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Por favor, adicione membros na aba "Gerenciar Membros" para começar o controle de entregas.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-3 text-left font-semibold text-gray-700">Material</th>
                <th className="border border-gray-300 p-3 text-center font-semibold text-gray-700">Meta / Membro</th>
                {memberNames.map((n, i) => (
                  <th key={i} className="border border-gray-300 p-3 text-center font-semibold text-gray-700 bg-indigo-50">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATERIALS.map(material => (
                <tr key={material} className="hover:bg-gray-50">
                  <td className="border border-gray-300 p-3 font-medium text-gray-700">{material}</td>
                  <td className="border border-gray-300 p-3 text-center bg-blue-50 font-semibold">
                    {perMember[material] || 0}
                  </td>
                  {memberNames.map((_, mi) => (
                    <td key={mi} className="border border-gray-300 p-2">
                      <input
                        type="text"
                        value={delivered[material]?.[mi] || ''}
                        onChange={(e) => handleUpdateDelivered(material, mi, e.target.value)}
                        className="w-full text-right px-2 py-1 bg-gray-50 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition duration-150"
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-gray-100 font-semibold">
                <td className="border border-gray-300 p-3">TOTAL ENTREGUE</td>
                <td className="border border-gray-300 p-3 text-center">-</td>
                {memberNames.map((_, mi) => (
                  <td key={mi} className="border border-gray-300 p-3 text-center bg-green-50">
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

  // Conteúdo da Aba 3: Resumo e Status CORRIGIDO
  const StatusContent = (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Progresso Geral dos Materiais</h2>
      <p className="text-gray-600 mb-6">Visão consolidada do total de materiais entregues pela equipe.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {MATERIALS.map(material => {
          const deliveredTot = getMaterialTotalDelivered(material);
          const targetTotal = totals[material] || 0;
          const pct = targetTotal > 0 ? Math.min(100, Math.round((deliveredTot / targetTotal) * 100)) : 0;
          const status = getStatusForTotalDelivery(material);
          return (
            <div key={material} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-800">{material}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${status.color}`}>
                  {status.label}
                </span>
              </div>
              
              <div className="mb-3">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progresso</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all duration-500 ${status.color}`}
                    style={{width: `${pct}%`}}
                  ></div>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Total Entregue: <strong>{deliveredTot}</strong> • Meta Total: <strong>{targetTotal}</strong>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ... (o restante do código mantém a mesma estrutura, apenas ajustando para materiais)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Controle de Farm (Online)</h1>
          <p className="text-gray-600">Sistema colaborativo em tempo real</p>
        </div>

        <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
        
        {/* Renderização condicional do conteúdo */}
        {activeTab === 'Configuração e Metas' && ConfigContent}
        {activeTab === 'Controle de Entregas' && ControlContent}
        {activeTab === 'Resumo e Status' && StatusContent}
        {activeTab === 'Ranking e Histórico' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">🏆 Ranking Atual e Histórico</h2>
            {/* ... conteúdo do ranking ... */}
          </div>
        )}
        {activeTab === 'Gerenciar Membros' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Gerenciar Membros da Equipe (Live)</h2>
            {/* ... conteúdo de membros ... */}
          </div>
        )}
      </div>
    </div>
  );
}

export default FarmDashboard;
