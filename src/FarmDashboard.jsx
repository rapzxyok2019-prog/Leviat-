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

// --- Componente Skeleton Loading ---
const SkeletonLoader = () => (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center p-6">
    <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 max-w-md w-full border border-white/20">
      <div className="animate-pulse">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-white/20 rounded-full"></div>
        </div>
        <div className="space-y-4">
          <div className="h-4 bg-white/20 rounded w-3/4 mx-auto"></div>
          <div className="h-3 bg-white/20 rounded w-1/2 mx-auto"></div>
          <div className="mt-6 space-y-3">
            <div className="h-3 bg-white/20 rounded"></div>
            <div className="h-3 bg-white/20 rounded"></div>
            <div className="h-3 bg-white/20 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// --- Barra de Progresso Animada ---
const AnimatedProgressBar = ({ percentage, color = 'from-blue-500 to-purple-500', height = 'h-3' }) => (
  <div className={`w-full bg-gray-700 rounded-full ${height} overflow-hidden shadow-inner`}>
    <div 
      className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-1000 ease-out shadow-lg`}
      style={{ 
        width: `${percentage}%`,
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s infinite'
      }}
    ></div>
  </div>
);

// --- Card com Efeito Hover ---
const AnimatedCard = ({ children, className = '' }) => (
  <div className={`bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-105 hover:border-white/40 ${className}`}>
    {children}
  </div>
);

// --- Hooks de Sincronização e Estado ---
const useSharedData = () => {
  const [production, setProductionState] = useState({ Colete: '200', Algema: '100', Capuz: '50', "Flipper MK3": '20' });
  const [memberNames, setMemberNamesState] = useState(['Membro 1', 'Membro 2', 'Membro 3']);
  const [delivered, setDeliveredState] = useState({});
  const [history, setHistory] = useState([]);
  const [isDbReady, setIsDbReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [syncProgress, setSyncProgress] = useState(0);

  // Efeito 1: Autenticação
  useEffect(() => {
    const setupAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
        setUserId(auth.currentUser.uid);
        
        // Simula progresso de sincronização
        const interval = setInterval(() => {
          setSyncProgress(prev => {
            if (prev >= 100) {
              clearInterval(interval);
              return 100;
            }
            return prev + 10;
          });
        }, 200);
        
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

    let loadedListeners = 0;
    const totalListeners = 4;

    const updateProgress = () => {
      loadedListeners++;
      setSyncProgress(Math.min(100, (loadedListeners / totalListeners) * 100));
    };

    console.log("🚀 Iniciando sincronização Firebase...");
    
    // Listener Produção
    const unsubProduction = onSnapshot(PRODUCTION_DOC_REF, (docSnap) => {
      if (docSnap.exists() && docSnap.data().production) {
        setProductionState(docSnap.data().production);
      } else if (!docSnap.exists()) {
        setDoc(PRODUCTION_DOC_REF, { production });
      }
      updateProgress();
    });

    // Listener Membros
    const unsubMembers = onSnapshot(MEMBERS_DOC_REF, (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().memberNames)) {
        setMemberNamesState(docSnap.data().memberNames);
      } else if (!docSnap.exists()) {
        setDoc(MEMBERS_DOC_REF, { memberNames });
      }
      updateProgress();
    });

    // Listener Entregas
    const unsubDelivered = onSnapshot(DELIVERED_DOC_REF, (docSnap) => {
      if (docSnap.exists() && typeof docSnap.data().delivered === 'object') {
        setDeliveredState(docSnap.data().delivered);
      } else if (!docSnap.exists()) {
        setDoc(DELIVERED_DOC_REF, { delivered: {} });
      }
      updateProgress();
    });

    // Listener Histórico
    const historyQuery = query(HISTORY_COLLECTION_REF, orderBy("date", "desc"));
    const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
      const historyList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(historyList);
      updateProgress();
    });

    setTimeout(() => {
      setIsDbReady(true);
    }, 1000);

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

  return { production, updateProduction, memberNames, updateMemberNames, delivered, updateDelivered, history, isDbReady, syncProgress };
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
    <div className="flex flex-wrap gap-3 mb-8">
      {tabs.map((tab, index) => (
        <button
          key={index}
          onClick={() => setActiveTab(tab)}
          className={`px-6 py-4 rounded-2xl font-bold text-lg transition-all duration-500 transform hover:scale-110 ${
            activeTab === tab 
              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-2xl animate-pulse' 
              : 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/20 shadow-lg hover:shadow-xl'
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="text-xl">{icons[tab] || ''}</span>
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
  const { production, updateProduction, memberNames, updateMemberNames, delivered, updateDelivered, history, isDbReady, syncProgress } = useSharedData();
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
    if(memberDelivered >= memberTarget) return {label:"🎯 Atingida",color:"from-green-400 to-emerald-500"};
    if(memberDelivered >= memberTarget * 0.5) return {label:"📈 Parcial",color:"from-amber-400 to-orange-500"};
    return {label:"⏳ Pendente",color:"from-red-400 to-pink-500"};
  }, [perMember, delivered]);

  const getStatusForTotalDelivery = useCallback((mat) => {
    const deliveredTot = getMaterialTotalDelivered(mat);
    const targetTotal = totals[mat] || 0;
    if(deliveredTot>=targetTotal) return {label:"🎯 Atingida",color:"from-green-400 to-emerald-500"};
    if(deliveredTot>=targetTotal*0.5) return {label:"📈 Parcial",color:"from-amber-400 to-orange-500"};
    return {label:"⏳ Pendente",color:"from-red-400 to-pink-500"};
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center p-6">
        <AnimatedCard className="p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-2xl animate-bounce">
              ⚡
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-4">Conectando ao Sistema...</h2>
          
          <div className="mb-6">
            <div className="flex justify-between text-white/80 text-sm mb-2">
              <span>Sincronizando dados</span>
              <span>{syncProgress}%</span>
            </div>
            <AnimatedProgressBar percentage={syncProgress} height="h-3" />
          </div>
          
          <div className="space-y-2 text-white/60 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${syncProgress >= 25 ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
              <span>Conectando ao Firebase...</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${syncProgress >= 50 ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
              <span>Carregando dados de produção...</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${syncProgress >= 75 ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
              <span>Sincronizando membros...</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${syncProgress >= 100 ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
              <span>Finalizando sincronização...</span>
            </div>
          </div>
        </AnimatedCard>
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
      <AnimatedCard className="p-8 mt-8">
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span className="text-3xl">📊</span>
          Progresso Individual de {memberName}
        </h3>
        
        <div className="mb-8">
          <div className="flex justify-between text-white/80 mb-3">
            <span className="font-semibold">Progresso Geral</span>
            <span className="font-bold text-xl text-white">{pct}%</span>
          </div>
          <AnimatedProgressBar percentage={pct} height="h-4" color="from-cyan-400 to-blue-500" />
          <p className="text-white/70 text-center mt-4 text-lg">
            <strong className="text-green-300">{individualProgress.delivered}</strong> entregues de <strong className="text-blue-300">{individualProgress.target}</strong> unidades
          </p>
        </div>

        <div>
          <h4 className="font-bold text-white text-xl mb-6 flex items-center gap-2">
            <span>🎯</span>
            Status por Material
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(perMember).map(mat => {
              const status = getStatusForMemberDelivery(mat, memberIndex);
              const deliveredQty = Number(delivered[mat]?.[memberIndex]) || 0;
              const materialPct = perMember[mat] > 0 ? Math.min(100, Math.round((deliveredQty / perMember[mat]) * 100)) : 0;
              
              return (
                <AnimatedCard key={mat} className="p-4 hover:scale-105">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-bold text-white text-sm">{mat}</span>
                    <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded">Meta: {perMember[mat]}</span>
                  </div>
                  
                  <div className="mb-2">
                    <AnimatedProgressBar percentage={materialPct} height="h-2" color={status.color} />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-white/80">{deliveredQty} / {perMember[mat]}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${status.color} text-white shadow-lg`}>
                      {status.label}
                    </span>
                  </div>
                </AnimatedCard>
              );
            })}
          </div>
        </div>

        <button 
          onClick={() => setViewingMemberIndex(null)} 
          className="mt-8 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg rounded-2xl hover:from-purple-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-2xl w-full animate-pulse"
        >
          ✨ Fechar Visualização
        </button>
      </AnimatedCard>
    );
  };

  // Conteúdo da Aba 1: Configuração e Metas
  const ConfigContent = (
    <AnimatedCard className="p-8">
      <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="text-4xl">⚙️</span>
        Configuração de Produção
      </h2>
      <p className="text-white/70 mb-8 text-lg">As metas são instantaneamente compartilhadas e calculadas para todos os membros.</p>
      
      <div className="space-y-6 mb-10">
        {Object.keys(production).map(prod => (
          <AnimatedCard key={prod} className="p-6 hover:scale-105">
            <div className="flex items-center gap-6">
              <span className="font-bold text-white text-lg min-w-[140px]">{prod}</span>
              <input
                type="text"
                value={production[prod]}
                onChange={(e) => handleUpdateProduction(prod, e.target.value)}
                className="flex-grow border-2 border-white/20 bg-white/5 text-white rounded-xl px-4 py-3 text-right text-lg font-bold focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition duration-300 shadow-inner"
                placeholder="0"
              />
            </div>
          </AnimatedCard>
        ))}
      </div>

      <AnimatedCard className="p-8">
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span className="text-3xl">🎯</span>
          Metas por Pessoa (Total: {memberCount} Membros)
        </h3>
        {memberCount > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(perMember).map(mat => (
              <AnimatedCard key={mat} className="p-4 text-center hover:scale-105">
                <div className="text-white font-bold text-lg mb-2">{mat}</div>
                <div className="text-cyan-300 font-black text-2xl">{perMember[mat]}</div>
                <div className="text-white/60 text-sm">unidades</div>
              </AnimatedCard>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">👥</div>
            <p className="text-white/80 text-lg">Adicione membros na aba 'Gerenciar Membros' para calcular as metas!</p>
          </div>
        )}
      </AnimatedCard>
    </AnimatedCard>
  );

  // Conteúdo da Aba 2: Controle de Entregas
  const ControlContent = (
    <AnimatedCard className="p-8">
      <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="text-4xl">📦</span>
        Registro de Entregas por Membro
      </h2>
      <p className="text-green-300 mb-8 text-lg font-semibold animate-pulse">
        ⚡ As alterações são visíveis para toda a equipe em tempo real!
      </p>

      {memberCount === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-6">👥</div>
          <p className="text-white/80 text-xl">Adicione membros na aba "Gerenciar Membros" para começar!</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/20 shadow-2xl">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                <th className="border border-white/20 p-4 text-left font-bold text-lg">Material</th>
                <th className="border border-white/20 p-4 text-center font-bold text-lg">Meta / Membro</th>
                {memberNames.map((n, i) => (
                  <th key={i} className="border border-white/20 p-4 text-center font-bold text-lg bg-purple-700">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(perMember).map(mat => (
                <tr key={mat} className="hover:bg-white/5 transition-colors">
                  <td className="border border-white/10 p-4 font-bold text-white bg-white/5">{mat}</td>
                  <td className="border border-white/10 p-4 text-center font-black text-cyan-300 bg-white/5 text-lg">
                    {perMember[mat]}
                  </td>
                  {memberNames.map((_, mi) => (
                    <td key={mi} className="border border-white/10 p-3">
                      <input
                        type="text"
                        value={delivered[mat]?.[mi] || ''}
                        onChange={(e) => handleUpdateDelivered(mat, mi, e.target.value)}
                        className="w-full text-right px-3 py-2 bg-white/5 border-2 border-white/10 text-white rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition duration-200 shadow-inner font-bold"
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black">
                <td className="border border-white/20 p-4 text-lg">TOTAL ENTREGUE</td>
                <td className="border border-white/20 p-4 text-center">-</td>
                {memberNames.map((_, mi) => (
                  <td key={mi} className="border border-white/20 p-4 text-center bg-emerald-700 text-xl">
                    {getMemberTotalDelivered(mi)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </AnimatedCard>
  );

  // Conteúdo da Aba 3: Resumo e Status
  const StatusContent = (
    <AnimatedCard className="p-8">
      <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="text-4xl">📈</span>
        Progresso Geral da Semana
      </h2>
      <p className="text-white/70 mb-8 text-lg">Visão consolidada do total de material entregue pela equipe.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {Object.keys(totals).map(mat => {
          const deliveredTot = getMaterialTotalDelivered(mat);
          const pct = Math.min(100, totals[mat] > 0 ? Math.round((deliveredTot / totals[mat]) * 100) : 0);
          const status = getStatusForTotalDelivery(mat);
          
          return (
            <AnimatedCard key={mat} className="p-6 hover:scale-105">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold text-white">{mat}</h3>
                <span className={`px-4 py-2 rounded-full text-sm font-bold text-white bg-gradient-to-r ${status.color} shadow-lg`}>
                  {status.label}
                </span>
              </div>
              
              <div className="mb-6">
                <div className="flex justify-between text-white/80 mb-3">
                  <span>Progresso</span>
                  <span className="font-black text-xl text-white">{pct}%</span>
                </div>
                <AnimatedProgressBar percentage={pct} height="h-4" color={status.color} />
              </div>
              
              <div className="text-center bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-white/80 text-sm">
                  Total Entregue: <strong className="text-green-300 text-lg">{deliveredTot}</strong>
                </p>
                <p className="text-white/80 text-sm">
                  Meta Total: <strong className="text-cyan-300 text-lg">{totals[mat]}</strong>
                </p>
              </div>
            </AnimatedCard>
          );
        })}
      </div>
    </AnimatedCard>
  );

  // Componente para Tabela de Histórico
  const MonthlyHistoryTable = ({ history }) => {
    if (history.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-6xl mb-6">📅</div>
          <p className="text-white/80 text-xl">Nenhum mês anterior encontrado.</p>
          <p className="text-white/60 mt-2">Feche o mês atual para iniciar o histórico!</p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {history.map(monthData => (
          <AnimatedCard key={monthData.id} className="p-8">
            <h3 className="text-2xl font-bold text-white mb-6 bg-gradient-to-r from-cyan-400 to-blue-400 text-transparent bg-clip-text">
              {monthData.label}
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-white/20 shadow-lg">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-700 to-gray-800 text-white">
                    <th className="border border-white/20 p-4 text-left font-bold">#</th>
                    <th className="border border-white/20 p-4 text-left font-bold">Membro</th>
                    <th className="border border-white/20 p-4 text-center font-bold">Entregue</th>
                    <th className="border border-white/20 p-4 text-center font-bold">Meta</th>
                    <th className="border border-white/20 p-4 text-center font-bold">% Concluído</th>
                    <th className="border border-white/20 p-4 text-center font-bold">Medalha</th>
                  </tr>
                </thead>
                <tbody>
                  {monthData.members.map((member, index) => (
                    <tr key={index} className="hover:bg-white/5 transition-colors">
                      <td className="border border-white/10 p-4 font-bold text-white">{index + 1}</td>
                      <td className="border border-white/10 p-4 font-semibold text-white">{member.name}</td>
                      <td className="border border-white/10 p-4 text-center text-green-300 font-bold">{member.totalDelivered}</td>
                      <td className="border border-white/10 p-4 text-center text-cyan-300 font-bold">{member.totalTarget}</td>
                      <td className="border border-white/10 p-4 text-center font-black text-lg">{member.pct}%</td>
                      <td className="border border-white/10 p-4 text-center text-3xl">{member.medal.split(' ')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnimatedCard>
        ))}
      </div>
    );
  };

  // Conteúdo da Aba 4: Ranking e Histórico
  const RankingAndHistoryContent = (
    <AnimatedCard className="p-8">
      <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="text-4xl">🏆</span>
        Ranking Atual e Histórico
      </h2>

      <div className="mb-12">
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span>📊</span>
          Ranking Atual (Progresso Individual)
        </h3>
        
        {currentRanking.length === 0 || memberCount === 0 || Object.values(totals).every(t => t === 0) ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-6">🎯</div>
            <p className="text-white/80 text-xl">Adicione membros e configure metas para visualizar o ranking!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/20 shadow-2xl">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <th className="border border-white/20 p-4 text-left font-bold text-lg">#</th>
                  <th className="border border-white/20 p-4 text-left font-bold text-lg">Membro</th>
                  <th className="border border-white/20 p-4 text-center font-bold text-lg">Medalha</th>
                  <th className="border border-white/20 p-4 text-center font-bold text-lg">Entregue</th>
                  <th className="border border-white/20 p-4 text-center font-bold text-lg">Meta</th>
                  <th className="border border-white/20 p-4 text-center font-bold text-lg">% Concluído</th>
                </tr>
              </thead>
              <tbody>
                {currentRanking.map((item, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="border border-white/10 p-4 font-black text-white text-lg">{idx + 1}</td>
                    <td className="border border-white/10 p-4 font-semibold text-white">{item.name}</td>
                    <td className="border border-white/10 p-4 text-center text-3xl">{item.medal.split(' ')[0]}</td>
                    <td className="border border-white/10 p-4 text-center font-bold text-green-300">{item.totalDelivered}</td>
                    <td className="border border-white/10 p-4 text-center font-bold text-cyan-300">{item.totalTarget}</td>
                    <td className="border border-white/10 p-4 text-center font-black text-white text-lg">{item.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-12">
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span>🗓️</span>
          Ações de Controle Mensal
        </h3>
        <p className="text-white/70 mb-6 text-lg">Ao fechar o mês, o progresso atual é salvo no histórico e todos os campos de entrega são zerados.</p>
        <button
          onClick={handleCloseMonth}
          disabled={memberCount === 0 || Object.values(totals).every(t => t === 0)}
          className="px-8 py-4 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold text-lg rounded-2xl hover:from-red-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-2xl disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed animate-pulse"
        >
          🗓️ Fechar Mês Atual e Zerar Entregas
        </button>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span>📚</span>
          Histórico de Meses Anteriores
        </h3>
        <MonthlyHistoryTable history={history} />
      </div>
    </AnimatedCard>
  );

  // Conteúdo da Aba 5: Gerenciar Membros
  const MemberContent = (
    <AnimatedCard className="p-8">
      <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="text-4xl">👥</span>
        Gerenciar Membros da Equipe
      </h2>
      <p className="text-green-300 mb-8 text-lg font-semibold animate-pulse">
        ⚡ Qualquer alteração é compartilhada instantaneamente com todos!
      </p>

      {/* Adicionar Membro */}
      <AnimatedCard className="p-8 mb-10">
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
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
        }} className="flex gap-4">
          <input
            type="text"
            name="newMemberName"
            placeholder="Digite o nome do membro..."
            className="flex-grow border-2 border-white/20 bg-white/5 text-white rounded-xl px-6 py-4 text-lg focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition duration-300 shadow-inner"
          />
          <button type="submit" className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold text-lg rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all duration-300 transform hover:scale-105 shadow-2xl">
            ➕ Adicionar
          </button>
        </form>
      </AnimatedCard>

      {/* Lista de Membros */}
      <div>
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span>📋</span>
          Membros Atuais ({memberCount})
        </h3>
        <div className="space-y-4">
          {memberNames.map((name, index) => (
            <AnimatedCard key={index} className="p-6 hover:scale-105">
              <div className="flex items-center gap-4">
                <span className="font-black text-white text-lg bg-gradient-to-r from-purple-500 to-pink-500 rounded-full w-12 h-12 flex items-center justify-center shadow-lg">
                  {index + 1}
                </span>
                <span className="flex-grow font-semibold text-white text-lg">{name}</span>
                
                <button
                  onClick={() => setViewingMemberIndex(index)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  📊 Progresso
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
                  className="w-32 text-lg border-2 border-white/20 bg-white/5 text-white rounded-xl px-4 py-2 text-center focus:ring-2 focus:ring-cyan-300 shadow-inner"
                />
                
                <button
                  onClick={() => handleRemoveMember(index)}
                  className="px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold rounded-xl hover:from-red-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  🗑️ Remover
                </button>
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>

      {/* Visualizador de Progresso Individual */}
      {viewingMemberIndex !== null && <MemberProgressViewer memberIndex={viewingMemberIndex} />}
    </AnimatedCard>
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-6 relative overflow-hidden">
      {/* Efeito de partículas no background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/5 animate-pulse"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 100 + 50}px`,
              height: `${Math.random() * 100 + 50}px`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${Math.random() * 10 + 10}s`
            }}
          />
        ))}
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black text-white mb-6 drop-shadow-2xl bg-gradient-to-r from-cyan-400 via-purple-400 to-blue-400 text-transparent bg-clip-text animate-pulse">
            🏭 LEVIATA FARM CONTROL
          </h1>
          <p className="text-white/70 text-xl font-semibold">Sistema colaborativo em tempo real • Dados sincronizados na nuvem</p>
        </div>

        <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
        {renderContent()}
        
        {/* Footer */}
        <div className="text-center mt-16 pt-8 border-t border-white/20">
          <p className="text-white/50 text-sm">Sistema desenvolvido para controle colaborativo de farm • Todos os dados em tempo real</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

export default FarmDashboard;
