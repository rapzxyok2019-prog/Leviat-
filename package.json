import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, 
    setPersistence, browserLocalPersistence 
} from 'firebase/auth';
import { 
    getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, addDoc, 
    serverTimestamp, getDocs, orderBy, where
} from 'firebase/firestore';

// --- Variáveis Globais Obrigatórias do Ambiente ---
// USANDO process.env.REACT_APP_... para ler as variáveis injetadas pelo Netlify.

// Configuração fornecida pelo usuário para fallback/estrutura.
const USER_FIREBASE_CONFIG = {
    // Tenta ler a variável de ambiente, se não encontrar, usa o valor fixo (fallback)
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyB2mlLKLqVwvx7FMq8qLkYAwHLkjljDYIU",
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "controle-de-farm-leviata.firebaseapp.com",
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "controle-de-farm-leviata",
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "controle-de-farm-leviata.firebasestorage.app",
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_ID || "736608761330",
    appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:736608761330:web:3e7193c697eea4ff7e676b"
};

const appId = typeof __app_id !== 'undefined' ? __app_id : USER_FIREBASE_CONFIG.projectId;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Tenta usar a configuração global; se não estiver disponível, usa a do usuário.
let firebaseConfig;
try {
    firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : USER_FIREBASE_CONFIG;
} catch (e) {
    firebaseConfig = USER_FIREBASE_CONFIG;
}

// 1. Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 2. Paths de Coleções Compartilhadas
// Usando o path de dados públicos obrigatório: /artifacts/{appId}/public/data/{your_collection_name}
const BASE_COLLECTION_PATH = `artifacts/${appId}/public/data/farm_config`;
const HISTORY_COLLECTION_REF = collection(db, `artifacts/${appId}/public/data/farm_history`);
const PRODUCTION_DOC_REF = doc(db, BASE_COLLECTION_PATH, 'production');
const MEMBERS_DOC_REF = doc(db, BASE_COLLECTION_PATH, 'members');
const DELIVERED_DOC_REF = doc(db, BASE_COLLECTION_PATH, 'delivered');

// --- Receitas ---
const RECIPES = {
  Colete: { Borracha: 10, "Plástico": 10, Alumínio: 20, Ferro: 20, Tecido: 1 },
  Algema: { Borracha: 20, "Plástico": 20, Alumínio: 25, Cobre: 25, Ferro: 30 },
  Capuz: { Borracha: 10, "Plástico": 10, Tecido: 1 },
  "Flipper MK3": { Alumínio: 25, Ferro: 25, Cobre: 25, "Emb. Plástica": 25, Titânio: 1 }
};

// --- Hooks de Sincronização e Estado ---

// Estado para Firebase (Sincroniza 3 documentos)
const useSharedData = () => {
    const [production, setProductionState] = useState({ Colete: '200', Algema: '100', Capuz: '50', "Flipper MK3": '20' });
    const [memberNames, setMemberNamesState] = useState(['Membro 1', 'Membro 2', 'Membro 3']);
    const [delivered, setDeliveredState] = useState({});
    const [history, setHistory] = useState([]);
    const [isDbReady, setIsDbReady] = useState(false);
    const [userId, setUserId] = useState(null);

    // Efeito 1: Autenticação e Configuração Inicial
    useEffect(() => {
        // Habilitar logs de debug do Firestore para ajudar
        // setLogLevel('Debug'); 

        const setupAuth = async () => {
            try {
                await setPersistence(auth, browserLocalPersistence);
                
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
                setUserId(auth.currentUser.uid);
            } catch (error) {
                console.error("Erro na autenticação:", error);
                // Fallback: se a auth falhar, usa um ID aleatório
                setUserId(crypto.randomUUID());
            }
        };
        setupAuth();
    }, []);

    // Efeito 2: Sincronização em Tempo Real (onSnapshot)
    useEffect(() => {
        if (!userId) return; // Espera o Auth

        // Configuração Inicial de Leitura e Escrita
        const initialSetup = async () => {
            console.log("Iniciando setup e listeners...");
            setIsDbReady(true);
        };
        initialSetup();

        // Listener 1: Produção
        const unsubProduction = onSnapshot(PRODUCTION_DOC_REF, (docSnap) => {
            if (docSnap.exists() && docSnap.data().production) {
                setProductionState(docSnap.data().production);
            } else if (!docSnap.exists()) {
                // Se não existir, salva o estado inicial
                setDoc(PRODUCTION_DOC_REF, { production: production });
            }
        }, (error) => console.error("Erro ao sincronizar Production:", error));

        // Listener 2: Membros
        const unsubMembers = onSnapshot(MEMBERS_DOC_REF, (docSnap) => {
            if (docSnap.exists() && Array.isArray(docSnap.data().memberNames)) {
                setMemberNamesState(docSnap.data().memberNames);
            } else if (!docSnap.exists()) {
                setDoc(MEMBERS_DOC_REF, { memberNames: memberNames });
            }
        }, (error) => console.error("Erro ao sincronizar Membros:", error));

        // Listener 3: Entregas Atuais
        const unsubDelivered = onSnapshot(DELIVERED_DOC_REF, (docSnap) => {
            if (docSnap.exists() && typeof docSnap.data().delivered === 'object') {
                setDeliveredState(docSnap.data().delivered);
            } else if (!docSnap.exists()) {
                setDoc(DELIVERED_DOC_REF, { delivered: delivered });
            }
        }, (error) => console.error("Erro ao sincronizar Entregas:", error));

        // Listener 4: Histórico Mensal (Coleção)
        const historyQuery = query(HISTORY_COLLECTION_REF, orderBy("date", "desc"));
        const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
            const historyList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setHistory(historyList);
        }, (error) => console.error("Erro ao sincronizar Histórico:", error));


        return () => {
            unsubProduction();
            unsubMembers();
            unsubDelivered();
            unsubHistory();
        };

    }, [userId]); // Depende do userId para iniciar

    // Funções de Escrita no Firestore
    const updateProduction = useCallback((newProduction) => {
        updateDoc(PRODUCTION_DOC_REF, { production: newProduction }).catch(e => console.error("Erro ao salvar Production:", e));
    }, []);

    const updateMemberNames = useCallback((newNames) => {
        updateDoc(MEMBERS_DOC_REF, { memberNames: newNames }).catch(e => console.error("Erro ao salvar Membros:", e));
    }, []);

    const updateDelivered = useCallback((newDelivered) => {
        updateDoc(DELIVERED_DOC_REF, { delivered: newDelivered }).catch(e => console.error("Erro ao salvar Entregas:", e));
    }, []);

    return {
        production, updateProduction,
        memberNames, updateMemberNames,
        delivered, updateDelivered,
        history,
        isDbReady
    };
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
  
function ceilDivide(a, b) { return Math.ceil(a / b); }

// FUNÇÃO DE RANKING (para estado atual e histórico)
function calculateRanking(memberNames, perMember, delivered) {
    if (memberNames.length === 0 || Object.keys(perMember).length === 0) return [];

    return memberNames.map((name, index) => {
        let totalTarget = 0;
        let totalDelivered = 0;

        Object.keys(perMember).forEach(mat => {
            const target = perMember[mat] || 0;
            // CORREÇÃO: Garante que o valor entregue é lido corretamente ou é 0 se for string vazia
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

        return {
            name,
            index,
            totalTarget,
            totalDelivered,
            pct,
            medal
        };
    })
    .sort((a, b) => b.pct - a.pct); 
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
    <div className="flex border-b border-gray-300 mb-6 overflow-x-auto">
      {tabs.map((tab, index) => (
        <button
          key={index}
          className={`py-3 px-4 sm:px-6 text-base sm:text-lg font-semibold whitespace-nowrap transition-colors duration-200 focus:outline-none ${
            activeTab === tab
              ? 'border-b-4 border-indigo-600 text-indigo-700 bg-gray-100/50'
              : 'text-gray-500 hover:text-indigo-500 hover:border-b-4 border-transparent'
          }`}
          onClick={() => setActiveTab(tab)}
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
  
  // Substituído useLocalStorage por useSharedData
  const { 
    production, updateProduction, 
    memberNames, updateMemberNames, 
    delivered, updateDelivered, 
    history, 
    isDbReady 
  } = useSharedData();
    
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

  // Efeito de Ajuste da Estrutura 'delivered' (Offline -> Online Data Shape)
  // Isso garante que a estrutura 'delivered' no estado local seja sempre válida para o número atual de membros e materiais.
  useEffect(() => {
    if (!isDbReady) return;

    // Função para calcular o próximo estado de delivered
    const getNextDelivered = (prev) => {
      const next = {};
      const currentMaterials = Object.keys(totals);
      
      currentMaterials.forEach(mat => {
          const previousDeliveries = prev[mat] || [];
          // Garante que o array tenha o tamanho correto, preenchendo com '' se necessário
          next[mat] = Array.from({length: memberCount}, (_, i) => previousDeliveries[i] ?? '');
      });
      
      return next;
    };

    // Apenas aplica se a contagem de membros ou materiais mudou a estrutura esperada
    const currentKeys = Object.keys(delivered);
    if (memberCount !== (delivered[currentKeys[0]]?.length ?? 0) || currentKeys.length !== Object.keys(totals).length) {
        const nextDelivered = getNextDelivered(delivered);
        // Atualiza no Firestore se houver uma diferença estrutural
        updateDelivered(nextDelivered); 
    }

    if (viewingMemberIndex !== null && viewingMemberIndex >= memberCount) {  
        setViewingMemberIndex(null);
    }
  }, [memberCount, totals, delivered, updateDelivered, viewingMemberIndex, isDbReady]); 
  
  // --- Funções de Manipulação de Dados (Disparam atualização no Firestore) ---
    
  const handleUpdateProduction = useCallback((product, value) => {   
      // Permite string vazia ('') ou um número positivo  
      const sanitizedValue = value === '' || (!isNaN(Number(value)) && Number(value) >= 0) ? value : production[product];
      updateProduction({...production, [product]: sanitizedValue});   
  }, [production, updateProduction]);   
  
  const handleUpdateDelivered = useCallback((material, memberIndex, value) => {   
    // Garante que a string vazia ('') seja um valor aceito, ou que seja um número positivo
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
      
    if(memberTarget === 0) return {label:"N/A", color:"bg-gray-400"};
    if(memberDelivered >= memberTarget) return {label:"Atingida",color:"bg-green-600"};
    if(memberDelivered >= memberTarget * 0.5) return {label:"Parcial",color:"bg-amber-500"};
    return {label:"Pendente",color:"bg-red-600"};
  }, [perMember, delivered]);
  
  const getStatusForTotalDelivery = useCallback((mat) => {   
    const deliveredTot = getMaterialTotalDelivered(mat);   
    const targetTotal = totals[mat] || 0;   
    if(deliveredTot>=targetTotal) return {label:"Atingida",color:"bg-green-600"};
    if(deliveredTot>=targetTotal*0.5) return {label:"Parcial",color:"bg-amber-500"};
    return {label:"Pendente",color:"bg-red-600"};
  }, [getMaterialTotalDelivered, totals]);
    
  const getMemberTotalDelivered = useCallback((memberIndex) => {  
      return Object.keys(delivered).reduce((sum, mat) => sum + (Number(delivered[mat]?.[memberIndex]) || 0), 0);
  }, [delivered]);

  // NOVO: Função para Fechar o Mês e Reiniciar Entregas
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

    if (!window.confirm("ATENÇÃO: Você tem certeza que deseja fechar o mês atual? Isso salvará o progresso e ZERARÁ todos os campos de 'Controle de Entregas' para o novo ciclo.")) {
        return;
    }
    
    const now = new Date();
    const monthYear = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    
    // 1. Salva o snapshot do ranking atual (Adiciona um novo documento à coleção)
    const monthData = {
        label: monthYear.charAt(0).toUpperCase() + monthYear.slice(1), 
        date: serverTimestamp(), // Usa timestamp do servidor para ordenação
        members: currentRanking.map(r => ({...r})), 
    };
    
    try {
        await addDoc(HISTORY_COLLECTION_REF, monthData);
        
        // 2. Reseta as entregas no documento de Delivered
        const nextDelivered = {};
        Object.keys(totals).forEach(mat => {
            nextDelivered[mat] = Array(memberCount).fill('');
        });
        await updateDelivered(nextDelivered); // Usa a função de escrita do Firestore
        
        alert(`Mês de ${monthData.label} fechado com sucesso! Entregas zeradas para o próximo ciclo.`);
        setActiveTab('Controle de Entregas'); 
    } catch (e) {
        console.error("Erro ao fechar o mês:", e);
        alert("Erro ao fechar o mês e salvar histórico. Verifique o console.");
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
    if (!window.confirm(`Tem certeza que deseja remover ${memberNames[indexToRemove]}? As entregas dele serão zeradas.`)) {
        return;
    }
    
    const nextMemberNames = memberNames.filter((_, i) => i !== indexToRemove);
    
    // 1. Atualiza a lista de membros no Firestore
    await updateMemberNames(nextMemberNames);
      
    // 2. Ajusta e zera os dados de entrega deste membro no Firestore
    const nextDelivered = {};
    Object.keys(delivered).forEach(mat => {  
        nextDelivered[mat] = delivered[mat].filter((_, i) => i !== indexToRemove);
        // Garantir que a nova array tem o tamanho de nextMemberNames.length
        nextDelivered[mat] = Array.from({length: nextMemberNames.length}, (_, i) => nextDelivered[mat][i] ?? '');
    });  
    await updateDelivered(nextDelivered);
    
    setViewingMemberIndex(null);
  };
  
  if (!isDbReady) {
    return (
        <div className="flex justify-center items-center h-[50vh]">
            <div className="text-center p-6 bg-white rounded-xl shadow-lg">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                <p className="text-indigo-700 font-semibold">Conectando ao Painel Colaborativo...</p>
                <p className="text-sm text-gray-500 mt-1">Sincronizando dados em tempo real com o Firestore.</p>
            </div>
        </div>
    );
  }

  // --- Componentes de Conteúdo (HTML/JSX) ---
  
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
      
    const pct = individualProgress.target > 0   
        ? Math.min(100, Math.round((individualProgress.delivered / individualProgress.target) * 100))
        : 0;
  
    return (
        <div className="mt-8 pt-4 border-t border-indigo-200">
            <h3 className="text-xl font-bold mb-4 text-indigo-600">Progresso Individual de {memberName}</h3>
            <div className="p-3 mb-4 border border-indigo-300 rounded-lg bg-indigo-50/70">
                <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-indigo-800">Progresso Geral</span>
                    <span className="font-bold text-lg text-indigo-700">{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div   
                        style={{width:`${pct}%`}}   
                        className="h-3 rounded-full bg-indigo-500 transition-all duration-500 ease-out"
                    ></div>
                </div>
                <div className="text-xs text-indigo-600 mt-1">
                    **{individualProgress.delivered}** entregues de **{individualProgress.target}** unidades
                </div>
            </div>
        </div>
    );
  };
  
  // O restante do componente FarmDashboard
  
  // Função para Renderizar Conteúdo da Tab
  const renderTabContent = () => {
    switch (activeTab) {
        case 'Configuração e Metas':
            return (
                <div className="p-4 bg-white shadow rounded-lg">
                    <h2 className="text-2xl font-bold mb-4 text-indigo-700">Configuração e Metas de Produção</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.keys(RECIPES).map((product) => (
                            <div key={product} className="p-3 border rounded-lg bg-gray-50">
                                <label className="block text-sm font-medium text-gray-700">{product}</label>
                                <div className="mt-1 flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        value={production[product] ?? ''}
                                        onChange={(e) => handleUpdateProduction(product, e.target.value)}
                                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
                                        placeholder="Qtd. Total"
                                    />
                                    <span className="ml-3 text-sm text-gray-500">unidades</span>
                                </div>
                                <p className="text-xs text-indigo-600 mt-1">
                                    Total de materiais necessários:
                                    <ul className="list-disc list-inside ml-2">
                                        {Object.entries(RECIPES[product]).map(([mat, qty]) => (
                                            <li key={mat}>{mat}: {qty * (Number(production[product]) || 0)}</li>
                                        ))}
                                    </ul>
                                </p>
                            </div>
                        ))}
                    </div>

                    <h3 className="text-xl font-bold mt-8 mb-4 text-indigo-700">Meta Total de Materiais (Compartilhada)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                        {Object.entries(totals).map(([mat, totalQty]) => (
                            <div key={mat} className="text-center">
                                <p className="text-xs font-medium text-indigo-600">{mat}</p>
                                <p className="text-lg font-bold text-indigo-800">{totalQty}</p>
                                <p className="text-xs text-gray-500">
                                    Por membro: {perMember[mat] ?? 0}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            );

        case 'Controle de Entregas':
            return (
                <div className="p-4 bg-white shadow rounded-lg">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h2 className="text-2xl font-bold text-indigo-700">Controle de Entregas</h2>
                        <button
                            onClick={handleCloseMonth}
                            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-200 text-sm"
                        >
                            FECHAR MÊS
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                                        Material / Membro
                                    </th>
                                    {memberNames.map((name, index) => (
                                        <th key={index} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            {name}
                                        </th>
                                    ))}
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Total Entregue
                                    </th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Meta Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {Object.entries(totals).map(([mat, targetTotal]) => {
                                    const memberTarget = perMember[mat] || 0;
                                    const deliveredTotal = getMaterialTotalDelivered(mat);
                                    const status = getStatusForTotalDelivery(mat);

                                    return (
                                        <tr key={mat}>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200">
                                                {mat} (Meta/Membro: {memberTarget})
                                            </td>
                                            {memberNames.map((_, memberIndex) => {
                                                const memberDelivered = delivered[mat]?.[memberIndex] ?? '';
                                                const memberStatus = getStatusForMemberDelivery(mat, memberIndex);
                                                return (
                                                    <td key={memberIndex} className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-center relative">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={memberDelivered}
                                                            onChange={(e) => handleUpdateDelivered(mat, memberIndex, e.target.value)}
                                                            className={`w-full p-1 text-center border-2 rounded-md transition duration-150 text-sm ${
                                                                memberStatus.color.includes('green') ? 'border-green-300 bg-green-50/50' :
                                                                memberStatus.color.includes('amber') ? 'border-amber-300 bg-amber-50/50' :
                                                                'border-red-300 bg-red-50/50'
                                                            }`}
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                );
                                            })}
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 text-center font-semibold border-l border-gray-200">
                                                {deliveredTotal}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 text-center font-bold">
                                                {targetTotal}
                                                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.color} text-white`}>
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
            );

        case 'Resumo e Status':
            return (
                <div className="p-4 bg-white shadow rounded-lg">
                    <h2 className="text-2xl font-bold mb-6 text-indigo-700">Resumo da Produção e Status Geral</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="p-4 border border-indigo-300 bg-indigo-50 rounded-lg shadow">
                            <h3 className="text-lg font-semibold text-indigo-800">Membros Ativos</h3>
                            <p className="text-4xl font-extrabold text-indigo-600 mt-1">{memberCount}</p>
                        </div>
                        <div className="p-4 border border-teal-300 bg-teal-50 rounded-lg shadow">
                            <h3 className="text-lg font-semibold text-teal-800">Total de Metas (Unidades)</h3>
                            <p className="text-4xl font-extrabold text-teal-600 mt-1">
                                {Object.values(totals).reduce((a, b) => a + b, 0)}
                            </p>
                        </div>
                        <div className="p-4 border border-amber-300 bg-amber-50 rounded-lg shadow">
                            <h3 className="text-lg font-semibold text-amber-800">Total Entregue (Unidades)</h3>
                            <p className="text-4xl font-extrabold text-amber-600 mt-1">
                                {Object.keys(totals).reduce((sum, mat) => sum + getMaterialTotalDelivered(mat), 0)}
                            </p>
                        </div>
                    </div>

                    <h3 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">Status de Materiais</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(totals).map(([mat, targetTotal]) => {
                            const deliveredTot = getMaterialTotalDelivered(mat);
                            const status = getStatusForTotalDelivery(mat);
                            const percentage = targetTotal > 0 ? Math.min(100, Math.round((deliveredTot / targetTotal) * 100)) : 0;

                            return (
                                <div key={mat} className="p-4 border rounded-lg shadow-sm">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-md font-semibold text-gray-800">{mat}</p>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.color} text-white`}>
                                            {status.label}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                                        <div 
                                            style={{ width: `${percentage}%` }} 
                                            className="h-2.5 rounded-full bg-indigo-500 transition-all duration-500"
                                        ></div>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        Entregue: **{deliveredTot}** / Meta: **{targetTotal}** ({percentage}%)
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );

        case 'Ranking e Histórico':
            return (
                <div className="p-4 bg-white shadow rounded-lg">
                    <h2 className="text-2xl font-bold mb-6 text-indigo-700 border-b pb-2">Ranking Atual (Este Ciclo)</h2>
                    
                    <div className="overflow-x-auto mb-8">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pos.</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Membro</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Medalha</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">% Meta</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Entregue</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Meta</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {currentRanking.map((member, index) => (
                                    <tr key={member.name} className={index === 0 ? 'bg-yellow-50/50 font-semibold' : ''}>
                                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                                        <td className="px-3 py-4 whitespace-nowrap text-sm text-indigo-600">
                                            {member.name}
                                        </td>
                                        <td className="px-3 py-4 whitespace-nowrap text-center text-xl">{member.medal}</td>
                                        <td className="px-3 py-4 whitespace-nowrap text-center text-sm">
                                            <span className={`font-bold ${member.pct >= 100 ? 'text-green-700' : 'text-gray-900'}`}>{member.pct}%</span>
                                        </td>
                                        <td className="px-3 py-4 whitespace-nowrap text-center text-sm">{member.totalDelivered}</td>
                                        <td className="px-3 py-4 whitespace-nowrap text-center text-sm">{member.totalTarget}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-indigo-700 border-b pb-2">Histórico de Meses Fechados</h2>
                    <div className="space-y-4">
                        {history.length === 0 ? (
                            <p className="text-gray-500 italic">Nenhum histórico encontrado. Feche o primeiro mês na aba "Controle de Entregas" para começar.</p>
                        ) : (
                            history.map((month) => (
                                <div key={month.id} className="p-4 border rounded-lg bg-gray-50 shadow-sm">
                                    <h3 className="text-xl font-bold text-indigo-800 mb-2">{month.label}</h3>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Membro</th>
                                                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Medalha</th>
                                                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">% Meta</th>
                                                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Entregue</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {month.members.sort((a,b) => b.pct - a.pct).map((member) => (
                                                    <tr key={member.name}>
                                                        <td className="px-3 py-2 whitespace-nowrap">{member.name}</td>
                                                        <td className="px-3 py-2 whitespace-nowrap text-center text-lg">{member.medal}</td>
                                                        <td className="px-3 py-2 whitespace-nowrap text-center font-bold">{member.pct}%</td>
                                                        <td className="px-3 py-2 whitespace-nowrap text-center">{member.totalDelivered}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            );

        case 'Gerenciar Membros':
            return (
                <div className="p-4 bg-white shadow rounded-lg">
                    <h2 className="text-2xl font-bold mb-4 text-indigo-700 border-b pb-2">Gerenciar Membros da Farm</h2>

                    {/* Adicionar Membro */}
                    <div className="mb-8 p-4 border border-green-300 bg-green-50 rounded-lg">
                        <h3 className="text-xl font-semibold text-green-700 mb-3">Adicionar Novo Membro</h3>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const newName = e.target.name.value.trim();
                            if (newName) {
                                handleAddMember(newName);
                                e.target.name.value = '';
                            }
                        }} className="flex space-x-2">
                            <input
                                type="text"
                                name="name"
                                placeholder="Nome do Novo Membro"
                                className="shadow-sm focus:ring-green-500 focus:border-green-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
                                required
                            />
                            <button
                                type="submit"
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-200"
                            >
                                Adicionar
                            </button>
                        </form>
                    </div>

                    {/* Lista de Membros */}
                    <h3 className="text-xl font-bold text-indigo-700 mb-3">Membros Atuais ({memberCount})</h3>
                    <ul className="divide-y divide-gray-200 border rounded-lg">
                        {memberNames.map((name, index) => (
                            <li key={index} className="p-4 flex justify-between items-center hover:bg-gray-50 transition duration-150">
                                <div className="flex-grow">
                                    {viewingMemberIndex === index ? (
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => handleRenameMember(index, e.target.value)}
                                            onBlur={() => setViewingMemberIndex(null)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') setViewingMemberIndex(null);
                                            }}
                                            className="font-medium text-lg text-indigo-600 border-b border-indigo-500 focus:outline-none"
                                            autoFocus
                                        />
                                    ) : (
                                        <span 
                                            className="font-medium text-lg text-gray-900 cursor-pointer"
                                            onClick={() => setViewingMemberIndex(index)}
                                        >
                                            {name}
                                        </span>
                                    )}
                                    <p className="text-sm text-gray-500">Total entregue: {getMemberTotalDelivered(index)} unidades</p>
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => handleRemoveMember(index)}
                                        className="text-red-600 hover:text-red-800 text-sm font-semibold"
                                    >
                                        Remover
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {viewingMemberIndex !== null && <MemberProgressViewer memberIndex={viewingMemberIndex} />}
                </div>
            );

        default:
            return null;
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center py-6 bg-white shadow-md rounded-lg mb-8">
          <h1 className="text-4xl font-extrabold text-indigo-800">
            Painel de Controle Leviatã (Farm)
          </h1>
          <p className="text-md text-gray-600 mt-1">
            Gerenciamento Colaborativo de Metas de Materiais
          </p>
        </header>

        <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="pb-8">
          {renderTabContent()}
        </main>

        <footer className="text-center text-sm text-gray-500 py-4 border-t mt-8">
            <p>
                Dados em tempo real com Firebase Firestore. Última atualização: {new Date().toLocaleTimeString()}
            </p>
        </footer>
      </div>
    </div>
  );
}

// export default FarmDashboard;
