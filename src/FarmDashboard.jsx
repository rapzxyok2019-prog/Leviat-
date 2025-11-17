import React, { useState, useEffect, useMemo, useCallback } from 'react'; 
import { initializeApp } from 'firebase/app'; 
import { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth'; 
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, addDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore'; 

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
const WEEKLY_GOALS_REF = doc(db, 'farm_data', 'weekly_goals');
const HISTORY_COLLECTION_REF = collection(db, 'farm_history');

// --- Receitas ATUALIZADAS ---
const RECIPES = {
  Colete: { Borracha: 10, "Plástico": 10, Alumínio: 20, Ferro: 20, Tecido: 1 },
  Algema: { Borracha: 20, "Plástico": 20, Alumínio: 25, Cobre: 15, Ferro: 25 },
  Capuz: { Borracha: 10, "Plástico": 10, Tecido: 1 },
  "Flipper MK3": { Alumínio: 25, Ferro: 25, Cobre: 25, "Emb. Plástica": 25, Titânio: 1 }
};

// LISTA DE MATERIAIS
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
  const [weeklyGoals, setWeeklyGoalsState] = useState({});
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

    // Listener Metas Manuais
    const unsubWeeklyGoals = onSnapshot(WEEKLY_GOALS_REF, (docSnap) => {
      if (docSnap.exists() && docSnap.data().goals) {
        setWeeklyGoalsState(docSnap.data().goals);
      } else if (!docSnap.exists()) {
        const initialGoals = {};
        MATERIALS.forEach(material => {
          initialGoals[material] = '0';
        });
        setDoc(WEEKLY_GOALS_REF, { goals: initialGoals });
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
      unsubWeeklyGoals();
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

  const updateWeeklyGoals = useCallback((newGoals) => {
    updateDoc(WEEKLY_GOALS_REF, { goals: newGoals });
  }, []);

  return { 
    production, updateProduction, 
    memberNames, updateMemberNames, 
    delivered, updateDelivered, 
    weeklyGoals, updateWeeklyGoals,
    history, 
    isDbReady 
  };
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

// ✅ CORREÇÃO COMPLETA: Função de ranking corrigida
function calculateRanking(memberNames, weeklyGoals, delivered) {
  if (memberNames.length === 0 || Object.keys(weeklyGoals).length === 0) return [];
  
  return memberNames.map((name, index) => {
    let totalTarget = 0;
    let totalDelivered = 0;
    let totalPossibleProgress = 0;
    let totalProgress = 0;
    
    Object.keys(weeklyGoals).forEach(material => {
      const target = Number(weeklyGoals[material]) || 0;
      const deliveredQty = Number(delivered[material]?.[index]) || 0;
      
      if (target > 0) {
        totalTarget += target;
        totalDelivered += deliveredQty;
        
        const progress = Math.min(100, (deliveredQty / target) * 100);
        totalPossibleProgress += 100;
        totalProgress += progress;
      }
    });
    
    // ✅ CORREÇÃO: Cálculo preciso da porcentagem
    const percentage = totalPossibleProgress > 0 
      ? (totalProgress / totalPossibleProgress) 
      : 0;
      
    const pct = Math.min(100, Math.round(percentage * 100));
    
    let medal = 'Nenhuma';
    if (pct >= 100) medal = '🥇 Ouro';
    else if (pct >= 80) medal = '🥈 Prata';
    else if (pct >= 50) medal = '🥉 Bronze';
    
    return { name, index, totalTarget, totalDelivered, pct, medal };
  }).sort((a, b) => b.pct - a.pct);
}

// ✅ CORREÇÃO COMPLETA: Função de resumo semanal corrigida
const calculateWeeklySummary = (memberIndex, weeklyGoals, delivered) => {
  let materialsCompleted = 0;
  let totalProgress = 0;
  let totalPossibleProgress = 0;
  
  MATERIALS.forEach(material => {
    const goal = Number(weeklyGoals[material]) || 0;
    const deliveredQty = Number(delivered[material]?.[memberIndex]) || 0;
    
    if (goal > 0) {
      const progress = Math.min(100, (deliveredQty / goal) * 100);
      totalPossibleProgress += 100;
      totalProgress += progress;
      
      // ✅ CORREÇÃO: Considera como completo se entregou pelo menos a meta
      if (deliveredQty >= goal) {
        materialsCompleted++;
      }
    }
  });

  // ✅ CORREÇÃO: Cálculo preciso do progresso geral
  const overallProgress = totalPossibleProgress > 0 
    ? Math.round((totalProgress / totalPossibleProgress) * 100) 
    : 0;

  const materialsWithGoals = MATERIALS.filter(m => Number(weeklyGoals[m]) > 0).length;

  return {
    materialsCompleted,
    materialsWithGoals,
    overallProgress,
    totalDelivered: Object.keys(delivered).reduce((sum, material) => 
      sum + (Number(delivered[material]?.[memberIndex]) || 0), 0)
  };
};

// --- Componente de Tabs ---
function Tabs({ tabs, activeTab, setActiveTab }) {
  const icons = {
    'Calculadora de Produção': '🧮',
    'Metas Manuais': '🎯',
    'Controle de Entregas': '📦', 
    'Resumo e Status': '📈',
    'Histórico Mensal': '📊',
    'Ranking': '🏆',
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
  const TABS = ['Calculadora de Produção', 'Metas Manuais', 'Controle de Entregas', 'Resumo e Status', 'Histórico Mensal', 'Ranking', 'Gerenciar Membros'];
  
  const { 
    production, updateProduction, 
    memberNames, updateMemberNames, 
    delivered, updateDelivered, 
    weeklyGoals, updateWeeklyGoals,
    history, 
    isDbReady 
  } = useSharedData();

  const [activeTab, setActiveTab] = useState('Controle de Entregas');
  const [viewingMemberIndex, setViewingMemberIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedMonths, setExpandedMonths] = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState({});
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
  
  const currentRanking = useMemo(() => calculateRanking(memberNames, weeklyGoals, delivered), [memberNames, weeklyGoals, delivered]);

  // Materiais filtrados para busca
  const filteredMaterials = useMemo(() => {
    return MATERIALS.filter(material => 
      material.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  // Agrupar histórico por mês
  const historyByMonth = useMemo(() => {
    const grouped = {};
    history.forEach(week => {
      const monthKey = week.monthYear || 'Sem Data';
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(week);
    });
    return grouped;
  }, [history]);

  // Efeito para ajustar estrutura de deliveries
  useEffect(() => {
    if (!isDbReady || memberCount === 0) return;

    const currentKeys = Object.keys(delivered);
    const expectedLength = delivered[currentKeys[0]]?.length ?? 0;
    
    if (memberCount !== expectedLength) {
      const nextDelivered = {};
      MATERIALS.forEach(material => {
        const previousDeliveries = delivered[material] || [];
        nextDelivered[material] = Array.from({length: memberCount}, (_, i) => previousDeliveries[i] ?? '');
      });
      updateDelivered(nextDelivered);
    }
  }, [memberCount, delivered, updateDelivered, isDbReady]);

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

  const handleUpdateWeeklyGoal = useCallback((material, value) => {
    const sanitizedValue = value === '' || (!isNaN(Number(value)) && Number(value) >= 0) ? value : weeklyGoals[material];
    updateWeeklyGoals({...weeklyGoals, [material]: sanitizedValue});
  }, [weeklyGoals, updateWeeklyGoals]);

  // Funções para Accordion
  const toggleMonth = useCallback((monthKey) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  }, []);

  const toggleWeek = useCallback((weekId) => {
    setExpandedWeeks(prev => ({
      ...prev,
      [weekId]: !prev[weekId]
    }));
  }, []);

  // ✅ NOVA FUNÇÃO: Apagar semana do histórico
  const handleDeleteWeek = async (weekId, weekLabel) => {
    if (!window.confirm(`Tem certeza que deseja apagar a semana:\n"${weekLabel}"?\n\nEsta ação não pode ser desfeita!`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'farm_history', weekId));
      alert('Semana apagada com sucesso!');
    } catch (error) {
      console.error('Erro ao apagar semana:', error);
      alert('Erro ao apagar semana. Tente novamente.');
    }
  };

  // Funções Auxiliares
  const getMaterialTotalDelivered = useCallback((material) => {
    return (delivered[material] || []).reduce((a,b) => a + (Number(b) || 0), 0);
  }, [delivered]);

  const getStatusForMemberDelivery = useCallback((material, memberIndex) => {
    const target = Number(weeklyGoals[material]) || 0;
    const deliveredQty = Number(delivered[material]?.[memberIndex]) || 0;
    if(target === 0) return {label:"N/A", color:"from-gray-400 to-gray-500", bgColor: "bg-gray-400"};
    if(deliveredQty >= target) return {label:"Atingida", color:"from-green-500 to-emerald-600", bgColor: "bg-green-500"};
    if(deliveredQty >= target * 0.5) return {label:"Parcial", color:"from-amber-400 to-orange-500", bgColor: "bg-amber-500"};
    return {label:"Pendente", color:"from-red-400 to-red-600", bgColor: "bg-red-500"};
  }, [weeklyGoals, delivered]);

  const getStatusForTotalDelivery = useCallback((material) => {
    const deliveredTot = getMaterialTotalDelivered(material);
    const targetTotal = Number(weeklyGoals[material]) || 0;
    if(deliveredTot >= targetTotal) return {label:"Atingida", color:"from-green-500 to-emerald-600", bgColor: "bg-green-500"};
    if(deliveredTot >= targetTotal * 0.5) return {label:"Parcial", color:"from-amber-400 to-orange-500", bgColor: "bg-amber-500"};
    return {label:"Pendente", color:"from-red-400 to-red-600", bgColor: "bg-red-500"};
  }, [getMaterialTotalDelivered, weeklyGoals]);

  const getMemberTotalDelivered = useCallback((memberIndex) => {
    return Object.keys(delivered).reduce((sum, material) => sum + (Number(delivered[material]?.[memberIndex]) || 0), 0);
  }, [delivered]);

  // ✅ CORREÇÃO: Função para calcular progresso geral preciso
  const calculateOverallProgress = useCallback(() => {
    let totalProgress = 0;
    let totalPossibleProgress = 0;
    
    MATERIALS.forEach(material => {
      const goal = Number(weeklyGoals[material]) || 0;
      const deliveredTotal = getMaterialTotalDelivered(material);
      
      if (goal > 0) {
        const progress = Math.min(100, (deliveredTotal / goal) * 100);
        totalPossibleProgress += 100;
        totalProgress += progress;
      }
    });
    
    return totalPossibleProgress > 0 ? Math.round((totalProgress / totalPossibleProgress)) : 0;
  }, [weeklyGoals, getMaterialTotalDelivered]);

  // ✅ NOVA FUNÇÃO: Calcular produtos entregues baseado nos materiais
  const calculateProductsDelivered = useCallback((memberIndex = null) => {
    const products = {};
    
    Object.keys(RECIPES).forEach(product => {
      products[product] = Infinity; // Começa com infinito
      
      Object.entries(RECIPES[product]).forEach(([material, required]) => {
        let deliveredQty;
        
        if (memberIndex !== null) {
          // Para um membro específico
          deliveredQty = Number(delivered[material]?.[memberIndex]) || 0;
        } else {
          // Para o total geral
          deliveredQty = getMaterialTotalDelivered(material);
        }
        
        const possibleProducts = Math.floor(deliveredQty / required);
        products[product] = Math.min(products[product], possibleProducts);
      });
      
      // Se ainda é infinito, significa que não tem materiais suficientes
      if (products[product] === Infinity) {
        products[product] = 0;
      }
    });
    
    return products;
  }, [delivered, getMaterialTotalDelivered]);

  // ✅ CORREÇÃO COMPLETA: Função para Fechar a Semana
  async function handleCloseMonth() {
    if (memberCount === 0) {
      alert("Adicione membros primeiro.");
      return;
    }
    
    const totalMetas = Object.values(weeklyGoals).reduce((a,b) => a + (Number(b) || 0), 0);
    if (totalMetas === 0) {
      alert("Defina metas na aba 'Metas Manuais' antes de fechar a semana.");
      return;
    }

    if (!window.confirm("Fechar a semana atual? Isso salvará o progresso e ZERARÁ todos os campos de 'Controle de Entregas'.")) {
      return;
    }

    const now = new Date();
    const weekNumber = Math.ceil(now.getDate() / 7);
    const monthYear = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const weekLabel = `Semana ${weekNumber} - ${monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}`;
    
    // ✅ CORREÇÃO: Usar a função corrigida calculateWeeklySummary
    const memberSummaries = memberNames.map((member, index) => {
      const summary = calculateWeeklySummary(index, weeklyGoals, delivered);
      const productsDelivered = calculateProductsDelivered(index);
      
      return {
        name: member,
        ...summary,
        productsDelivered, // ✅ ADICIONADO: Produtos entregues
        details: MATERIALS.map(material => ({
          material,
          goal: Number(weeklyGoals[material]) || 0,
          delivered: Number(delivered[material]?.[index]) || 0,
          completed: Number(delivered[material]?.[index]) >= Number(weeklyGoals[material])
        }))
      };
    });

    const totalProductsDelivered = calculateProductsDelivered(); // ✅ ADICIONADO: Produtos totais

    const monthData = {
      label: weekLabel,
      weekNumber: weekNumber,
      monthYear: monthYear,
      date: serverTimestamp(),
      members: memberSummaries,
      goals: {...weeklyGoals},
      totalDelivered: Object.keys(delivered).reduce((sum, mat) => sum + getMaterialTotalDelivered(mat), 0),
      totalProductsDelivered // ✅ ADICIONADO: Produtos totais no histórico
    };

    try {
      await addDoc(HISTORY_COLLECTION_REF, monthData);
      
      const nextDelivered = {};
      MATERIALS.forEach(material => {
        nextDelivered[material] = Array(memberCount).fill('');
      });
      await updateDelivered(nextDelivered);
      
      alert(`Semana ${monthData.label} fechada com sucesso!`);
      setActiveTab('Histórico Mensal');
    } catch (e) {
      console.error("Erro ao fechar a semana:", e);
      alert("Erro ao fechar a semana. Verifique o console.");
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

  // --- COMPONENTES DE CONTEÚDO ---

  // Componente de Visualização de Progresso Individual
  const MemberProgressViewer = ({ memberIndex }) => {
    const memberName = memberNames[memberIndex];
    if (memberIndex === null || memberIndex >= memberNames.length) return null;
    
    const individualProgress = Object.keys(weeklyGoals).reduce((acc, material) => {
      const target = Number(weeklyGoals[material]) || 0;
      const deliveredQty = Number(delivered[material]?.[memberIndex]) || 0;
      acc.target += target;
      acc.delivered += deliveredQty;
  
      return acc;
    }, { target: 0, delivered: 0 });
  
    const percentage = individualProgress.target > 0 
      ? Math.min(100, Math.round((individualProgress.delivered / individualProgress.target) * 100))
      : 0;

    const productsDelivered = calculateProductsDelivered(memberIndex);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 rounded-t-2xl text-white">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">📊 Progresso de {memberName}</h2>
              <button 
                onClick={() => setViewingMemberIndex(null)}
                className="text-white hover:text-gray-200 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold">{percentage}%</div>
                <div className="text-sm opacity-90">Progresso Total</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{individualProgress.delivered}</div>
                <div className="text-sm opacity-90">Entregue</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{individualProgress.target}</div>
                <div className="text-sm opacity-90">Meta Total</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{Math.max(0, individualProgress.target - individualProgress.delivered)}</div>
                <div className="text-sm opacity-90">Faltante</div>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {/* ✅ ADICIONADO: Produtos Entregues */}
            <h3 className="text-xl font-semibold mb-4">🎁 Produtos que Podem Ser Feitos</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {Object.entries(productsDelivered).map(([product, quantity]) => (
                <div key={product} className="bg-gray-50 rounded-xl p-4 text-center border">
                  <div className="text-2xl font-bold text-gray-800">{quantity}</div>
                  <div className="text-gray-600 text-sm">{product}</div>
                </div>
              ))}
            </div>

            <h3 className="text-xl font-semibold mb-4">📦 Detalhes por Material</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MATERIALS.map(material => {
                const target = Number(weeklyGoals[material]) || 0;
                const deliveredQty = Number(delivered[material]?.[memberIndex]) || 0;
                const materialPercentage = target > 0 ? Math.min(100, Math.round((deliveredQty / target) * 100)) : 0;
                const status = getStatusForMemberDelivery(material, memberIndex);
                
                return (
                  <div key={material} className="border rounded-xl p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">{MATERIAL_ICONS[material]} {material}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.bgColor} text-white`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      {deliveredQty} / {target} ({materialPercentage}%)
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full bg-gradient-to-r ${status.color}`}
                        style={{ width: `${materialPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Renderização do conteúdo principal
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-indigo-600 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Cabeçalho */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            🏭 Painel de Farm - Leviata
          </h1>
          <p className="text-white/80 text-lg">
            Controle colaborativo de produção e entregas
          </p>
        </div>

        {/* Tabs */}
        <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Conteúdo das Tabs */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/20">
          
          {/* Tab: Calculadora de Produção */}
          {activeTab === 'Calculadora de Produção' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">🧮 Calculadora de Produção</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Produção */}
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30">
                  <h3 className="text-xl font-semibold text-white mb-4">🎯 Produção Desejada</h3>
                  {Object.entries(production).map(([product, qty]) => (
                    <div key={product} className="flex items-center justify-between mb-3">
                      <label className="text-white font-medium">{product}</label>
                      <input
                        type="text"
                        value={qty}
                        onChange={(e) => handleUpdateProduction(product, e.target.value)}
                        className="w-20 px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-white text-center"
                      />
                    </div>
                  ))}
                </div>

                {/* Totais */}
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30">
                  <h3 className="text-xl font-semibold text-white mb-4">📊 Totais de Materiais</h3>
                  <div className="space-y-3">
                    {Object.entries(totals).map(([material, total]) => (
                      <div key={material} className="flex justify-between items-center">
                        <span className="text-white">
                          {MATERIAL_ICONS[material]} {material}
                        </span>
                        <span className="text-white font-bold">{total}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-white/20">
                    <h4 className="text-lg font-semibold text-white mb-3">👥 Por Membro ({memberCount} membros)</h4>
                    <div className="space-y-2">
                      {Object.entries(perMember).map(([material, per]) => (
                        <div key={material} className="flex justify-between items-center">
                          <span className="text-white text-sm">
                            {MATERIAL_ICONS[material]} {material}
                          </span>
                          <span className="text-white font-bold">{per}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Metas Manuais */}
          {activeTab === 'Metas Manuais' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">🎯 Metas Manuais da Semana</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {MATERIALS.map(material => (
                  <div key={material} className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                    <div className="flex items-center justify-between">
                      <label className="text-white font-medium">
                        {MATERIAL_ICONS[material]} {material}
                      </label>
                      <input
                        type="text"
                        value={weeklyGoals[material] || ''}
                        onChange={(e) => handleUpdateWeeklyGoal(material, e.target.value)}
                        className="w-24 px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-white text-center"
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Controle de Entregas */}
          {activeTab === 'Controle de Entregas' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">📦 Controle de Entregas</h2>
                <div className="flex gap-3">
                  <button
                    onClick={handleCloseMonth}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors"
                  >
                    ✅ Fechar Semana
                  </button>
                </div>
              </div>

              {/* Busca */}
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="🔍 Buscar material..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-white/20 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
                />
              </div>

              {/* Tabela de Entregas */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-3 px-4 text-white font-semibold">Material</th>
                      {memberNames.map((name, index) => (
                        <th key={index} className="text-center py-3 px-2 text-white font-semibold min-w-[120px]">
                          <div 
                            className="cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
                            onClick={() => setViewingMemberIndex(index)}
                          >
                            {name}
                          </div>
                        </th>
                      ))}
                      <th className="text-center py-3 px-4 text-white font-semibold">Total</th>
                      <th className="text-center py-3 px-4 text-white font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map(material => {
                      const totalDelivered = getMaterialTotalDelivered(material);
                      const status = getStatusForTotalDelivery(material);
                      
                      return (
                        <tr key={material} className="border-b border-white/10 hover:bg-white/5">
                          <td className="py-3 px-4 text-white font-medium">
                            {MATERIAL_ICONS[material]} {material}
                          </td>
                          
                          {memberNames.map((_, memberIndex) => (
                            <td key={memberIndex} className="py-2 px-1 text-center">
                              <input
                                type="text"
                                value={delivered[material]?.[memberIndex] || ''}
                                onChange={(e) => handleUpdateDelivered(material, memberIndex, e.target.value)}
                                className="w-20 px-2 py-1 rounded-lg bg-white/20 border border-white/30 text-white text-center focus:outline-none focus:ring-1 focus:ring-white/50"
                                placeholder="0"
                              />
                            </td>
                          ))}
                          
                          <td className="py-3 px-4 text-center text-white font-bold">
                            {totalDelivered}
                          </td>
                          
                          <td className="py-3 px-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.bgColor} text-white`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Resumo e Status */}
          {activeTab === 'Resumo e Status' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">📈 Resumo e Status da Semana</h2>
              
              {/* Cards de Resumo Geral */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30 text-center">
                  <div className="text-3xl font-bold text-white mb-2">
                    {Object.values(weeklyGoals).reduce((sum, goal) => sum + (Number(goal) || 0), 0)}
                  </div>
                  <div className="text-white/80">Meta Total da Semana</div>
                </div>
                
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30 text-center">
                  <div className="text-3xl font-bold text-white mb-2">
                    {Object.keys(delivered).reduce((sum, material) => sum + getMaterialTotalDelivered(material), 0)}
                  </div>
                  <div className="text-white/80">Total Entregue</div>
                </div>
                
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30 text-center">
                  <div className="text-3xl font-bold text-white mb-2">
                    {calculateOverallProgress()}%
                  </div>
                  <div className="text-white/80">Progresso Geral</div>
                </div>
              </div>

              {/* ✅ ADICIONADO: Produtos que Podem Ser Feitos */}
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30 mb-8">
                <h3 className="text-xl font-semibold text-white mb-4">🎁 Produtos que Podem Ser Feitos</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(calculateProductsDelivered()).map(([product, quantity]) => (
                    <div key={product} className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-white">{quantity}</div>
                      <div className="text-white/80 text-sm">{product}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status por Material */}
              <h3 className="text-xl font-semibold text-white mb-4">📊 Status por Material</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {MATERIALS.map(material => {
                  const totalDelivered = getMaterialTotalDelivered(material);
                  const goal = Number(weeklyGoals[material]) || 0;
                  const percentage = goal > 0 ? Math.min(100, Math.round((totalDelivered / goal) * 100)) : 0;
                  const status = getStatusForTotalDelivery(material);
                  
                  return (
                    <div key={material} className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-white font-medium">
                          {MATERIAL_ICONS[material]} {material}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.bgColor} text-white`}>
                          {status.label}
                        </span>
                      </div>
                      
                      <div className="text-center mb-3">
                        <div className="text-2xl font-bold text-white">{totalDelivered} / {goal}</div>
                        <div className="text-white/80 text-sm">{percentage}% concluído</div>
                      </div>
                      
                      <div className="w-full bg-gray-400/30 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full bg-gradient-to-r ${status.color}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progresso dos Membros */}
              <h3 className="text-xl font-semibold text-white mt-8 mb-4">👥 Progresso Individual</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {memberNames.map((member, index) => {
                  const summary = calculateWeeklySummary(index, weeklyGoals, delivered);
                  
                  return (
                    <div 
                      key={index}
                      className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30 cursor-pointer hover:bg-white/30 transition-colors"
                      onClick={() => setViewingMemberIndex(index)}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-white font-medium">{member}</span>
                        <span className="text-white/80 text-sm">
                          {summary.materialsCompleted}/{summary.materialsWithGoals} materiais
                        </span>
                      </div>
                      
                      <div className="text-center mb-3">
                        <div className="text-2xl font-bold text-white">{summary.overallProgress}%</div>
                        <div className="text-white/80 text-sm">Progresso geral</div>
                      </div>
                      
                      <div className="w-full bg-gray-400/30 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-500"
                          style={{ width: `${summary.overallProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab: Histórico Mensal */}
          {activeTab === 'Histórico Mensal' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">📊 Histórico Mensal</h2>
              
              {Object.keys(historyByMonth).length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📭</div>
                  <h3 className="text-xl font-semibold text-white mb-2">Nenhum histórico encontrado</h3>
                  <p className="text-white/60">Feche algumas semanas para ver o histórico aqui</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(historyByMonth).map(([monthKey, weeks]) => (
                    <div key={monthKey} className="bg-white/20 backdrop-blur-sm rounded-2xl border border-white/30 overflow-hidden">
                      {/* Cabeçalho do Mês */}
                      <button
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full px-6 py-4 text-left hover:bg-white/10 transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <h3 className="text-xl font-semibold text-white">{monthKey}</h3>
                          <span className="text-white text-2xl">
                            {expandedMonths[monthKey] ? '▼' : '▶'}
                          </span>
                        </div>
                      </button>

                      {/* Conteúdo do Mês (expandível) */}
                      {expandedMonths[monthKey] && (
                        <div className="px-6 pb-4">
                          {weeks.map((week) => (
                            <div key={week.id} className="mb-4 last:mb-0 bg-white/10 rounded-xl p-4 border border-white/20">
                              {/* Cabeçalho da Semana */}
                              <button
                                onClick={() => toggleWeek(week.id)}
                                className="w-full text-left"
                              >
                                <div className="flex justify-between items-center">
                                  <h4 className="text-lg font-semibold text-white">{week.label}</h4>
                                  <div className="flex items-center gap-2">
                                    <span className="text-white/80 text-sm">
                                      {new Date(week.date?.toDate?.() || week.date).toLocaleDateString('pt-BR')}
                                    </span>
                                    <span className="text-white text-xl">
                                      {expandedWeeks[week.id] ? '▼' : '▶'}
                                    </span>
                                  </div>
                                </div>
                              </button>

                              {/* Conteúdo da Semana (expandível) */}
                              {expandedWeeks[week.id] && (
                                <div className="mt-4">
                                  {/* Botão de Apagar */}
                                  <div className="flex justify-end mb-4">
                                    <button
                                      onClick={() => handleDeleteWeek(week.id, week.label)}
                                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                                    >
                                      🗑️ Apagar Semana
                                    </button>
                                  </div>

                                  {/* Resumo da Semana */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-white/20 rounded-xl p-3 text-center">
                                      <div className="text-2xl font-bold text-white">{week.totalDelivered}</div>
                                      <div className="text-white/80 text-sm">Total Entregue</div>
                                    </div>
                                    <div className="bg-white/20 rounded-xl p-3 text-center">
                                      <div className="text-2xl font-bold text-white">
                                        {Object.values(week.goals || {}).reduce((sum, goal) => sum + (Number(goal) || 0), 0)}
                                      </div>
                                      <div className="text-white/80 text-sm">Meta Total</div>
                                    </div>
                                    <div className="bg-white/20 rounded-xl p-3 text-center">
                                      <div className="text-2xl font-bold text-white">
                                        {week.members?.length || 0}
                                      </div>
                                      <div className="text-white/80 text-sm">Membros</div>
                                    </div>
                                    <div className="bg-white/20 rounded-xl p-3 text-center">
                                      <div className="text-2xl font-bold text-white">
                                        {Math.round((week.totalDelivered / Object.values(week.goals || {}).reduce((sum, goal) => sum + (Number(goal) || 1), 1)) * 100)}%
                                      </div>
                                      <div className="text-white/80 text-sm">Conclusão</div>
                                    </div>
                                  </div>

                                  {/* ✅ ADICIONADO: Produtos do Histórico */}
                                  {week.totalProductsDelivered && (
                                    <>
                                      <h5 className="text-lg font-semibold text-white mb-3">🎁 Produtos que Podiam Ser Feitos</h5>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                        {Object.entries(week.totalProductsDelivered).map(([product, quantity]) => (
                                          <div key={product} className="bg-white/10 rounded-lg p-3 text-center">
                                            <div className="text-white font-medium text-sm">{product}</div>
                                            <div className="text-white/80 text-xs">{quantity} unidades</div>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}

                                  {/* Detalhes dos Membros */}
                                  <h5 className="text-lg font-semibold text-white mb-3">🏆 Desempenho dos Membros</h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {week.members?.map((member, index) => (
                                      <div key={index} className="bg-white/10 rounded-xl p-4 border border-white/20">
                                        <h6 className="font-semibold text-white mb-2">{member.name}</h6>
                                        <div className="space-y-2">
                                          <div className="flex justify-between text-sm">
                                            <span className="text-white/80">Progresso:</span>
                                            <span className="text-white font-medium">{member.overallProgress}%</span>
                                          </div>
                                          <div className="flex justify-between text-sm">
                                            <span className="text-white/80">Materiais:</span>
                                            <span className="text-white font-medium">
                                              {member.materialsCompleted}/{member.materialsWithGoals}
                                            </span>
                                          </div>
                                          <div className="flex justify-between text-sm">
                                            <span className="text-white/80">Total Entregue:</span>
                                            <span className="text-white font-medium">{member.totalDelivered}</span>
                                          </div>
                                          {/* ✅ ADICIONADO: Produtos do membro no histórico */}
                                          {member.productsDelivered && (
                                            <div className="pt-2 border-t border-white/20">
                                              <div className="text-white/80 text-xs mb-1">Produtos possíveis:</div>
                                              <div className="grid grid-cols-2 gap-1">
                                                {Object.entries(member.productsDelivered).slice(0, 2).map(([product, qty]) => (
                                                  <div key={product} className="text-white text-xs">
                                                    {product}: {qty}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Metas da Semana */}
                                  <h5 className="text-lg font-semibold text-white mt-6 mb-3">🎯 Metas da Semana</h5>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {Object.entries(week.goals || {}).map(([material, goal]) => (
                                      goal > 0 && (
                                        <div key={material} className="bg-white/10 rounded-lg p-3 text-center">
                                          <div className="text-white font-medium text-sm">{MATERIAL_ICONS[material]} {material}</div>
                                          <div className="text-white/80 text-xs">Meta: {goal}</div>
                                        </div>
                                      )
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Ranking */}
          {activeTab === 'Ranking' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">🏆 Ranking da Semana</h2>
              
              {currentRanking.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📊</div>
                  <h3 className="text-xl font-semibold text-white mb-2">Nenhum dado para ranking</h3>
                  <p className="text-white/60">Defina metas e entregas para ver o ranking</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {currentRanking.map((member, index) => (
                    <div 
                      key={member.index}
                      className={`bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30 cursor-pointer hover:bg-white/30 transition-all duration-300 transform hover:scale-105 ${
                        index === 0 ? 'ring-2 ring-yellow-400 shadow-lg' : ''
                      }`}
                      onClick={() => setViewingMemberIndex(member.index)}
                    >
                      <div className="text-center">
                        {/* Medalha */}
                        <div className="text-4xl mb-3">
                          {index === 0 && '🥇'}
                          {index === 1 && '🥈'}
                          {index === 2 && '🥉'}
                          {index > 2 && '📊'}
                        </div>
                        
                        {/* Posição */}
                        <div className="text-white/60 text-sm mb-1">#{index + 1} no ranking</div>
                        
                        {/* Nome */}
                        <h3 className="text-xl font-bold text-white mb-3">{member.name}</h3>
                        
                        {/* Estatísticas */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-white/80">Progresso:</span>
                            <span className="text-white font-bold">{member.pct}%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/80">Entregue:</span>
                            <span className="text-white font-bold">{member.totalDelivered}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/80">Meta:</span>
                            <span className="text-white font-bold">{member.totalTarget}</span>
                          </div>
                        </div>
                        
                        {/* Barra de Progresso */}
                        <div className="mt-4 w-full bg-gray-400/30 rounded-full h-3">
                          <div 
                            className="h-3 rounded-full bg-gradient-to-r from-green-400 to-emerald-500"
                            style={{ width: `${member.pct}%` }}
                          ></div>
                        </div>
                        
                        {/* Medalha */}
                        <div className="mt-3">
                          <span className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-medium rounded-full">
                            {member.medal}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Gerenciar Membros */}
          {activeTab === 'Gerenciar Membros' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">👥 Gerenciar Membros</h2>
              
              {/* Adicionar Novo Membro */}
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 border border-white/30 mb-6">
                <h3 className="text-xl font-semibold text-white mb-4">➕ Adicionar Novo Membro</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target);
                  const name = formData.get('newMember');
                  if (name.trim()) {
                    handleAddMember(name);
                    e.target.reset();
                  }
                }} className="flex gap-3">
                  <input
                    type="text"
                    name="newMember"
                    placeholder="Nome do novo membro..."
                    className="flex-1 px-4 py-3 rounded-2xl bg-white/20 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-semibold transition-colors"
                  >
                    Adicionar
                  </button>
                </form>
              </div>

              {/* Lista de Membros */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {memberNames.map((member, index) => (
                  <div key={index} className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-semibold text-white">{member}</h3>
                      <button
                        onClick={() => handleRemoveMember(index)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        title="Remover membro"
                      >
                        🗑️
                      </button>
                    </div>
                    
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.target);
                      const newName = formData.get('rename');
                      if (newName.trim() && newName !== member) {
                        handleRenameMember(index, newName);
                      }
                    }} className="space-y-3">
                      <input
                        type="text"
                        name="rename"
                        defaultValue={member}
                        className="w-full px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-white text-center focus:outline-none focus:ring-1 focus:ring-white/50"
                      />
                      <button
                        type="submit"
                        className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                      >
                        Renomear
                      </button>
                    </form>
                    
                    <div className="mt-3 pt-3 border-t border-white/20 text-center">
                      <div className="text-white/80 text-sm">
                        Total Entregue: {getMemberTotalDelivered(index)}
                      </div>
                      <button
                        onClick={() => setViewingMemberIndex(index)}
                        className="mt-2 w-full px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
                      >
                        Ver Progresso
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {memberNames.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">👥</div>
                  <h3 className="text-xl font-semibold text-white mb-2">Nenhum membro cadastrado</h3>
                  <p className="text-white/60">Adicione membros para começar o controle</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Progresso Individual */}
        {viewingMemberIndex !== null && (
          <MemberProgressViewer memberIndex={viewingMemberIndex} />
        )}
      </div>
    </div>
  );
}

export default FarmDashboard;
