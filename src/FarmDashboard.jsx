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

// Ícones para cada material
const MATERIAL_ICONS = {
  'Borracha': '🛞',
  'Plástico': '🧪',
  'Alumínio': '🔩',
  'Cobre': '🔌',
  'Ferro': '⚙️',
  'Emb. Plástica': '🎨',
  'Titânio': '💎',
  'Tecido': '👕'
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

    // Listener Entregas
    const unsubDelivered = onSnapshot(DELIVERED_DOC_REF, (docSnap) => {
      if (docSnap.exists() && typeof docSnap.data().delivered === 'object') {
        setDeliveredState(docSnap.data().delivered);
      } else if (!docSnap.exists()) {
        const initialDelivered = {};
        MATERIALS.forEach(material => {
          initialDelivered[material] = ['', '', ''];
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

// --- Funções de Cálculo ---
function sumMaterials(production) {
  const totals = {};
  MATERIALS.forEach(material => {
    totals[material] = 0;
  });

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

// --- Componente de Tabs Melhorado ---
function Tabs({ tabs, activeTab, setActiveTab }) {
  const icons = {
    'Configuração e Metas': '⚙️',
    'Controle de Entregas': '📦', 
    'Resumo e Status': '📈',
    'Ranking e Histórico': '🏆',
    'Gerenciar Membros': '👥'
  };
  
  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {tabs.map((tab, index) => (
        <button
          key={index}
          onClick={() => setActiveTab(tab)}
          className={`px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${
            activeTab === tab 
              ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' 
              : 'bg-white/80 text-gray-700 hover:bg-white hover:shadow-md backdrop-blur-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{icons[tab] || ''}</span>
            <span>{tab}</span>
          </div>
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
  const [searchTerm, setSearchTerm] = useState('');
  const memberCount = memberNames.length;

  // Cálculos Memoizados
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

  // Materiais filtrados para busca
  const filteredMaterials = useMemo(() => {
    return MATERIALS.filter(material => 
      material.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  // Efeito de Ajuste da Estrutura 'delivered'
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

  // FUNÇÕES AUXILIARES
  const getMaterialTotalDelivered = useCallback((material) => {
    return (delivered[material] || []).reduce((a,b) => a + (Number(b) || 0), 0);
  }, [delivered]);

  const getStatusForMemberDelivery = useCallback((material, memberIndex) => {
    const memberTarget = perMember[material] || 0;
    const memberDelivered = Number(delivered[material]?.[memberIndex]) || 0;
    if(memberTarget === 0) return {label:"N/A", color:"from-gray-400 to-gray-500", bgColor: "bg-gray-400"};
    if(memberDelivered >= memberTarget) return {label:"Atingida", color:"from-green-500 to-emerald-600", bgColor: "bg-green-500"};
    if(memberDelivered >= memberTarget * 0.5) return {label:"Parcial", color:"from-amber-400 to-orange-500", bgColor: "bg-amber-500"};
    return {label:"Pendente", color:"from-red-400 to-red-600", bgColor: "bg-red-500"};
  }, [perMember, delivered]);

  const getStatusForTotalDelivery = useCallback((material) => {
    const deliveredTot = getMaterialTotalDelivered(material);
    const targetTotal = totals[material] || 0;
    if(deliveredTot >= targetTotal) return {label:"Atingida", color:"from-green-500 to-emerald-600", bgColor: "bg-green-500"};
    if(deliveredTot >= targetTotal * 0.5) return {label:"Parcial", color:"from-amber-400 to-orange-500", bgColor: "bg-amber-500"};
    return {label:"Pendente", color:"from-red-400 to-red-600", bgColor: "bg-red-500"};
  }, [getMaterialTotalDelivered, totals]);

  const getMemberTotalDelivered = useCallback((memberIndex) => {
    return Object.keys(delivered).reduce((sum, material) => sum + (Number(delivered[material]?.[memberIndex]) || 0), 0);
  }, [delivered]);

  // Função para Fechar o Mês
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

  // Funções de Gerenciamento de Membros
  const handleAddMember = (name) => {
    if (name.trim()) {
      updateMemberNames([...memberNames, name.trim()]);
    }
  };

  const handleRenameMember = (index, newName) => {
    if (newName.trim()) {
      updateMemberNames(memberNames.map((n, i) => (i === index ? newName.trim() : n)));
    }
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
      <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-indigo-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-12 max-w-md text-center border border-white/20">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-white mb-3">Conectando ao Painel Colaborativo...</h2>
          <p className="text-white/80">Sincronizando dados em tempo real</p>
        </div>
      </div>
    );
  }

  // --- COMPONENTES DE CONTEÚDO MELHORADOS ---

  // Componente de Visualização de Progresso Individual
  const MemberProgressViewer = ({ memberIndex }) => {
    const memberName = memberNames[memberIndex];
    if (memberIndex === null || memberIndex >= memberNames.length) return null;
    
    const individualProgress = Object.keys(perMember).reduce((acc, material) => {
      const target = perMember[material] || 0;
      const deliveredQty = Number(delivered[material]?.[memberIndex]) || 0;
      acc.target += target;
      acc.delivered += deliveredQty;
      return acc;
    }, { target: 0, delivered: 0 });
    
    const pct = individualProgress.target > 0 ? Math.min(100, Math.round((individualProgress.delivered / individualProgress.target) * 100)) : 0;

    return (
      <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-8 mt-6 border border-white/20">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-gray-800">📊 Progresso de {memberName}</h3>
          <button 
            onClick={() => setViewingMemberIndex(null)}
            className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300"
          >
            ✕ Fechar
          </button>
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-3">
            <span className="font-semibold">Progresso Geral</span>
            <span className="font-bold text-lg">{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-6 shadow-inner">
            <div 
              className="bg-gradient-to-r from-green-400 to-blue-500 h-6 rounded-full transition-all duration-1000 ease-out shadow-lg"
              style={{width: `${pct}%`}}
            ></div>
          </div>
          <p className="text-center text-gray-600 mt-3">
            <strong className="text-green-600 text-lg">{individualProgress.delivered}</strong> entregues de{' '}
            <strong className="text-blue-600 text-lg">{individualProgress.target}</strong> unidades
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700 mb-4 text-lg">📦 Status por Material:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(perMember).map(material => {
              const status = getStatusForMemberDelivery(material, memberIndex);
              const deliveredQty = Number(delivered[material]?.[memberIndex]) || 0;
              const progressPct = perMember[material] > 0 ? Math.min(100, (deliveredQty / perMember[material]) * 100) : 0;
              
              return (
                <div key={material} className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{MATERIAL_ICONS[material]}</span>
                      <span className="font-semibold text-gray-800">{material}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progresso</span>
                      <span>{Math.round(progressPct)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${status.bgColor}`}
                        style={{width: `${progressPct}%`}}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">{deliveredQty} / {perMember[material]}</span>
                    <span className="text-lg">
                      {status.label === "Atingida" ? "✅" : status.label === "Parcial" ? "🟡" : "❌"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Conteúdo da Aba 1: Configuração e Metas
  const ConfigContent = (
    <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl">
          <span className="text-2xl">⚙️</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Configuração de Produção</h2>
          <p className="text-gray-600">Defina as metas de produção para calcular as necessidades de materiais</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">🎯 Metas de Produção</h3>
          {Object.keys(production).map(prod => (
            <div key={prod} className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 border border-blue-200 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700 text-lg">{prod}</span>
                <div className="relative">
                  <input
                    type="text"
                    value={production[prod]}
                    onChange={(e) => handleUpdateProduction(prod, e.target.value)}
                    className="w-32 border-2 border-blue-200 rounded-xl px-4 py-3 text-right font-bold text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-gray-400">Qtd:</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-6 border border-blue-200">
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <span>👥</span>
            Metas por Pessoa ({memberCount} {memberCount === 1 ? 'Membro' : 'Membros'})
          </h3>
          {memberCount > 0 ? (
            <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto pr-2">
              {Object.keys(perMember).map(material => (
                <div key={material} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{MATERIAL_ICONS[material]}</span>
                      <span className="font-semibold text-gray-800">{material}</span>
                    </div>
                    <span className="bg-blue-500 text-white px-3 py-1 rounded-lg font-bold">
                      {perMember[material]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">👥</div>
              <p className="text-amber-600 font-semibold">Adicione membros para calcular as metas!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Conteúdo da Aba 2: Controle de Entregas
  const ControlContent = (
    <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl">
          <span className="text-2xl">📦</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Controle de Entregas</h2>
          <p className="text-gray-600">Registro em tempo real das entregas de materiais por membro</p>
        </div>
      </div>

      {/* Barra de Pesquisa */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="🔍 Pesquisar material..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/80 border-2 border-gray-300 rounded-2xl px-6 py-4 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200 backdrop-blur-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {memberCount === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-2xl font-bold text-gray-700 mb-2">Nenhum Membro Adicionado</h3>
          <p className="text-gray-600 mb-6">Adicione membros para começar o controle de entregas</p>
          <button
            onClick={() => setActiveTab('Gerenciar Membros')}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 transform hover:scale-105"
          >
            👥 Gerenciar Membros
          </button>
        </div>
      ) : (
        <div className="bg-white/60 rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                  <th className="p-4 text-left font-bold text-gray-700 text-lg border-b-2 border-gray-300">
                    Material
                  </th>
                  <th className="p-4 text-center font-bold text-gray-700 text-lg border-b-2 border-gray-300">
                    Meta / Membro
                  </th>
                  {memberNames.map((n, i) => (
                    <th key={i} className="p-4 text-center font-bold text-gray-700 text-lg border-b-2 border-gray-300 bg-gradient-to-b from-indigo-100 to-indigo-200">
                      <div className="flex flex-col items-center">
                        <span>{n}</span>
                        <button
                          onClick={() => setViewingMemberIndex(i)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 font-normal"
                        >
                          👁️ Ver
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map(material => (
                  <tr key={material} className="hover:bg-gray-50/80 transition-colors duration-200 border-b border-gray-200">
                    <td className="p-4 font-semibold text-gray-800">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{MATERIAL_ICONS[material]}</span>
                        {material}
                      </div>
                    </td>
                    <td className="p-4 text-center bg-gradient-to-b from-blue-50 to-blue-100 font-bold text-blue-700 text-lg">
                      {perMember[material] || 0}
                    </td>
                    {memberNames.map((_, mi) => {
                      const status = getStatusForMemberDelivery(material, mi);
                      return (
                        <td key={mi} className="p-3">
                          <div className="relative">
                            <input
                              type="text"
                              value={delivered[material]?.[mi] || ''}
                              onChange={(e) => handleUpdateDelivered(material, mi, e.target.value)}
                              className={`w-full text-right px-4 py-3 border-2 rounded-xl font-semibold transition-all duration-200 focus:ring-2 focus:ring-opacity-50 ${
                                status.label === "Atingida" 
                                  ? "border-green-300 bg-green-50 focus:border-green-500 focus:ring-green-200" 
                                  : status.label === "Parcial"
                                  ? "border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-amber-200"
                                  : "border-gray-300 bg-white focus:border-blue-500 focus:ring-blue-200"
                              }`}
                            />
                            {delivered[material]?.[mi] && (
                              <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${status.bgColor}`}>
                                {status.label === "Atingida" ? "✓" : status.label === "Parcial" ? "~" : "!"}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-gradient-to-r from-gray-100 to-gray-200 font-bold">
                  <td className="p-4 text-gray-800 text-lg">📊 TOTAL ENTREGUE</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  {memberNames.map((_, mi) => (
                    <td key={mi} className="p-4 text-center bg-gradient-to-b from-green-100 to-green-200 text-green-700 text-lg font-bold">
                      {getMemberTotalDelivered(mi)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // Conteúdo da Aba 3: Resumo e Status
  const StatusContent = (
    <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl">
          <span className="text-2xl">📈</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Resumo e Status</h2>
          <p className="text-gray-600">Visão geral do progresso de todos os materiais</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {MATERIALS.map(material => {
          const deliveredTot = getMaterialTotalDelivered(material);
          const targetTotal = totals[material] || 0;
          const pct = targetTotal > 0 ? Math.min(100, Math.round((deliveredTot / targetTotal) * 100)) : 0;
          const status = getStatusForTotalDelivery(material);
          
          return (
            <div key={material} className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{MATERIAL_ICONS[material]}</span>
                  <h3 className="font-bold text-gray-800 text-lg">{material}</h3>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${status.color}`}>
                  {status.label}
                </span>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progresso Geral</span>
                  <span className="font-bold">{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                  <div 
                    className={`h-3 rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${status.color}`}
                    style={{width: `${pct}%`}}
                  ></div>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  <span className="font-bold text-green-600 text-lg">{deliveredTot}</span> de{' '}
                  <span className="font-bold text-blue-600 text-lg">{targetTotal}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">unidades entregues</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Conteúdo da Aba 4: Ranking e Histórico
  const RankingAndHistoryContent = (
    <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-2xl">
          <span className="text-2xl">🏆</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Ranking e Histórico</h2>
          <p className="text-gray-600">Desempenho dos membros e histórico mensal</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Ranking Atual */}
        <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-2xl p-6 border border-amber-200">
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <span>📊</span>
            Ranking Atual
          </h3>
          
          {currentRanking.length === 0 || memberCount === 0 || Object.values(totals).every(t => Number(t) === 0) ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">📈</div>
              <p className="text-amber-600 font-semibold">Configure metas e adicione membros para ver o ranking</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentRanking.map((item, idx) => (
                <div key={idx} className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                        idx === 0 ? 'bg-gradient-to-r from-yellow-400 to-amber-500' :
                        idx === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                        idx === 2 ? 'bg-gradient-to-r from-amber-600 to-orange-500' :
                        'bg-gradient-to-r from-blue-400 to-blue-500'
                      }`}>
                        {idx + 1}
                      </div>
                      <span className="font-semibold text-gray-800">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">{item.medal.split(' ')[0]}</div>
                      <div className="text-sm text-gray-600">{item.pct}% concluído</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>{item.totalDelivered} / {item.totalTarget}</span>
                      <span>{item.pct}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-green-400 to-blue-500 h-2 rounded-full transition-all duration-1000"
                        style={{width: `${item.pct}%`}}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações e Histórico */}
        <div className="space-y-6">
          {/* Ação de Fechar Mês */}
          <div className="bg-gradient-to-br from-red-50 to-pink-100 rounded-2xl p-6 border border-red-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>🗓️</span>
              Controle Mensal
            </h3>
            <p className="text-gray-600 mb-4">Feche o mês atual para salvar o progresso e reiniciar as entregas</p>
            <button
              onClick={handleCloseMonth}
              disabled={memberCount === 0 || Object.values(totals).every(t => Number(t) === 0)}
              className="w-full px-6 py-4 bg-gradient-to-r from-red-500 to-pink-600 text-white font-bold rounded-xl hover:from-red-600 hover:to-pink-700 transition-all duration-300 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
            >
              🗓️ Fechar Mês Atual
            </button>
          </div>

          {/* Histórico */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-100 rounded-2xl p-6 border border-purple-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>📚</span>
              Histórico
            </h3>
            {history.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-600">Nenhum histórico disponível</p>
                <p className="text-sm text-gray-500">Feche o mês atual para começar o histórico</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {history.slice(0, 5).map(monthData => (
                  <div key={monthData.id} className="bg-white rounded-lg p-3 border border-purple-200">
                    <div className="font-semibold text-purple-700">{monthData.label}</div>
                    <div className="text-sm text-gray-600">
                      {monthData.members.length} membros • {monthData.members[0]?.pct || 0}% melhor
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Conteúdo da Aba 5: Gerenciar Membros
  const MemberContent = (
    <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl">
          <span className="text-2xl">👥</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Gerenciar Membros</h2>
          <p className="text-gray-600">Gerencie a equipe de forma colaborativa em tempo real</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Adicionar Membro */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-6 border border-blue-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span>➕</span>
            Adicionar Novo Membro
          </h3>
          <form onSubmit={(e) => {
            e.preventDefault();
            const newName = e.target.newMemberName.value.trim();
            if (newName) {
              handleAddMember(newName);
              e.target.newMemberName.value = '';
            }
          }} className="space-y-4">
            <input
              type="text"
              name="newMemberName"
              placeholder="Digite o nome do membro..."
              className="w-full border-2 border-blue-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
            />
            <button 
              type="submit"
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105"
            >
              ➕ Adicionar Membro
            </button>
          </form>
        </div>

        {/* Lista de Membros */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl p-6 border border-green-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span>👥</span>
            Membros da Equipe ({memberCount})
          </h3>
          
          {memberCount === 0 ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">👤</div>
              <p className="text-gray-600 font-semibold">Nenhum membro na equipe</p>
              <p className="text-gray-500 text-sm">Adicione o primeiro membro!</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {memberNames.map((name, index) => (
                <div key={index} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{name}</div>
                        <div className="text-sm text-gray-600">
                          Total: {getMemberTotalDelivered(index)} entregues
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewingMemberIndex(index)}
                        className="px-3 py-2 bg-gradient-to-r from-indigo-400 to-indigo-500 text-white rounded-lg hover:from-indigo-500 hover:to-indigo-600 transition-all duration-200"
                        title="Ver Progresso"
                      >
                        👁️
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
                        className="w-32 border-2 border-gray-300 rounded-lg px-3 py-2 text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                        title="Clique para editar"
                      />
                      
                      <button
                        onClick={() => handleRemoveMember(index)}
                        className="px-3 py-2 bg-gradient-to-r from-red-400 to-red-500 text-white rounded-lg hover:from-red-500 hover:to-red-600 transition-all duration-200"
                        title="Remover Membro"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visualizador de Progresso Individual */}
      {viewingMemberIndex !== null && <MemberProgressViewer memberIndex={viewingMemberIndex} />}
    </div>
  );

  // Renderização do Conteúdo
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
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-indigo-600 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl mb-6">
            <h1 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">
              🏭 Controle de Farm
            </h1>
            <p className="text-white/90 text-xl font-light">
              Sistema colaborativo em tempo real
            </p>
            <div className="flex justify-center items-center gap-4 mt-4 text-white/80">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <span>Conectado</span>
              </div>
              <span>•</span>
              <span>{memberCount} {memberCount === 1 ? 'membro' : 'membros'}</span>
              <span>•</span>
              <span>{Object.keys(production).length} produtos</span>
            </div>
          </div>
        </div>

        {/* Tabs e Conteúdo */}
        <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
        {renderContent()}

        {/* Footer */}
        <div className="text-center mt-12 mb-8">
          <p className="text-white/60 text-sm">
            🚀 Desenvolvido para otimizar o farm colaborativo • Atualizado em tempo real
          </p>
        </div>
      </div>
    </div>
  );
}

export default FarmDashboard;
