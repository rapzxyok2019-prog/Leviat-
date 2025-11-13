import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'; 

// --- CONFIGURAÇÃO FIREBASE ---
const USER_FIREBASE_CONFIG = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(USER_FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 1. RECEITAS E CONSTANTES ---
const RECIPES = {
  Colete: { Borracha: 10, "Plástico": 10, Alumínio: 20, Ferro: 20, Tecido: 1 },
  Algema: { Borracha: 20, "Plástico": 20, Alumínio: 25, Cobre: 25, Ferro: 30 },
  Capuz: { Borracha: 10, "Plástico": 10, Tecido: 1 },
  "Flipper MK3": { Alumínio: 25, Ferro: 25, Cobre: 25, "Emb. Plástica": 25, Titânio: 1 }
};

const TABS = ['Configuração e Metas', 'Controle de Entregas', 'Resumo e Status', 'Ranking e Histórico', 'Gerenciar Membros'];

// --- 2. HOOK CUSTOMIZADO PARA SINCRONIZAÇÃO EM NUVEM (Firestore) ---
function useFirestoreSync(docName, initialValue, isShared = true) {
    const [data, setData] = useState(initialValue);
    const [loading, setLoading] = useState(true);
    const docRef = doc(db, 'farmData', docName);

    // Função para escrever no Firestore
    const updateData = useCallback(async (newValue) => {
        const valueToStore = newValue instanceof Function ? newValue(data) : newValue;
        setData(valueToStore);
        try {
            if (isShared) { // Só tenta salvar se estiver logado (e for dado compartilhado)
                await setDoc(docRef, { value: valueToStore }, { merge: false });
            }
        } catch (error) {
            console.error(`Erro ao salvar ${docName} no Firestore:`, error);
        }
    }, [docRef, data, isShared]);
    
    // Efeito para carregar dados (LocalStorage -> Firestore) e sincronizar
    useEffect(() => {
        let unsubscribe;
        const loadAndSync = async () => {
            setLoading(true);
            
            // Tenta carregar do LocalStorage (para migração inicial)
            const localData = window.localStorage.getItem(`farm_${docName}`);
            let initialLoadValue = initialValue;

            if (localData) {
                try {
                    initialLoadValue = JSON.parse(localData);
                    console.log(`Dados ${docName} carregados do LocalStorage para possível migração.`);
                } catch (e) {
                    console.error("Erro ao parsear LocalStorage", e);
                }
            }

            // 1. Carregar/Migrar para o Firestore
            try {
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    // Já existe no Firestore, usa o valor da nuvem
                    initialLoadValue = docSnap.data().value;
                    console.log(`Dados ${docName} carregados do Firestore.`);
                } else if (localData) {
                    // Não existe na nuvem, mas existe localmente: MIGRAÇÃO
                    await setDoc(docRef, { value: initialLoadValue });
                    console.log(`Migração inicial de ${docName} do LocalStorage para Firestore concluída.`);
                    window.localStorage.removeItem(`farm_${docName}`); // Limpa o local
                } else {
                    // Não existe em lugar nenhum, salva o valor inicial na nuvem
                    await setDoc(docRef, { value: initialLoadValue });
                }
            } catch (err) {
                console.error(`Erro inicial de carregamento/migração de ${docName}. Usando valor local.`, err);
                // Em caso de erro, apenas continua com o valor que já temos
            }

            // 2. Setup Listener (Sincronização em Tempo Real)
            if (isShared) {
                unsubscribe = onSnapshot(docRef, (doc) => {
                    if (doc.exists()) {
                        const cloudValue = doc.data().value;
                        setData(cloudValue);
                    } else {
                        // Se o documento for deletado, volta ao valor inicial
                        setData(initialValue);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error(`Erro de sincronização em tempo real para ${docName}:`, error);
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        };

        loadAndSync();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [docRef, docName, initialValue, isShared]);

    return [data, updateData, loading];
}


// --- 3. FUNÇÕES DE CÁLCULO E UTILITÁRIOS (MANTIDAS) ---
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


// --- 4. COMPONENTE PRINCIPAL (FarmDashboard) ---
function FarmDashboard() {
  // ATUALIZADO: Usando useFirestoreSync para dados compartilhados
  const [production, setProduction, loadingProduction] = useFirestoreSync('production', { Colete: 200, Algema: 100, Capuz: 50, "Flipper MK3": 20 });
  const [memberNames, setMemberNames, loadingMembers] = useFirestoreSync('memberNames', ['Membro 1', 'Membro 2', 'Membro 3', 'Membro 4', 'Membro 5', 'Membro 6', 'Membro 7', 'Membro 8']);
  const [delivered, setDelivered, loadingDelivered] = useFirestoreSync('delivered', {});
  
  // O histórico mensal não precisa ser compartilhado em tempo real, pode ser LocalStorage ou Firestore (opcional, mantive LocalStorage aqui)
  const [monthlyHistory, setMonthlyHistory] = useState(() => {
    try {
        const item = window.localStorage.getItem('farm_monthly_history');
        return item ? JSON.parse(item) : [];
    } catch (e) { return []; }
  });
  useEffect(() => {
    window.localStorage.setItem('farm_monthly_history', JSON.stringify(monthlyHistory));
  }, [monthlyHistory]);
    
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('Controle de Entregas'); 
  const [viewingMemberIndex, setViewingMemberIndex] = useState(null); 
  
  const memberCount = memberNames.length;
  
  const totals = useMemo(()=>sumMaterials(production),[production]);
  const perMember = useMemo(()=>{   
    if(memberCount === 0) return {};
    const r={};   
    Object.entries(totals).forEach(([m,t])=>r[m]=ceilDivide(t,memberCount));   
    return r;   
  },[totals, memberCount]);

  const currentRanking = useMemo(() => calculateRanking(memberNames, perMember, delivered), [memberNames, perMember, delivered]);
  
  const loading = loadingProduction || loadingMembers || loadingDelivered || authLoading;

  // Efeito de Inicialização e Autenticação (Firebase)
  useEffect(() => {
    const authenticate = async () => {
        try {
            await setPersistence(auth, browserLocalPersistence);
            await signInAnonymously(auth); 
            setIsLoggedIn(true);
        } catch (err) {
            console.error("Erro no Painel (Firebase Auth):", err);
            setError("Erro no Firebase Auth. Verifique as chaves e a ativação de login anônimo: " + err.message);
        } finally {
            setAuthLoading(false);
        }
    };
    authenticate();
  }, []); 

  // Efeito para Sincronizar 'delivered' e 'memberCount' (Ajuste a estrutura ao carregar)
  useEffect(()=>{  
    // Esta lógica é importante para garantir que o array 'delivered' tenha o tamanho certo
    // de acordo com memberNames carregado do Firestore.
    setDelivered(prev => {   
      const next = {};   
      const currentMaterials = Object.keys(totals);  
        
      currentMaterials.forEach(mat => {  
          const previousDeliveries = prev[mat] || [];
          next[mat] = Array.from({length: memberCount}, (_, i) => previousDeliveries[i] ?? '');
      });
        
      Object.keys(prev).forEach(mat => {
          if (!currentMaterials.includes(mat)) {
              delete next[mat];
          }
      });
        
      return next;   
    });  
  
    if (viewingMemberIndex !== null && viewingMemberIndex >= memberCount) {  
        setViewingMemberIndex(null);
    }
  },[memberCount, totals, setDelivered, viewingMemberIndex, loadingMembers]); // Adicionei loadingMembers para garantir que memberNames carregou


  
  // --- Funções de Manipulação de Dados ---
    
  const updateProduction = useCallback((product, value) => {   
      const sanitizedValue = value === '' || (!isNaN(Number(value)) && Number(value) >= 0) ? value : production[product];
      setProduction(p=>({...p,[product]:sanitizedValue}));   
  }, [production, setProduction]);
  
  const updateDelivered = useCallback((material, memberIndex, value) => {   
    setDelivered(d => {   
      const valueToStore = (value === '' || (value === '0') || (!isNaN(Number(value)) && Number(value) >= 0)) ? value : (d[material]?.[memberIndex] ?? '');
  
      const next = {...d};   
      next[material] = next[material] ? [...next[material]] : Array(memberCount).fill('');   
      
      if (memberIndex < memberCount) {
        next[material][memberIndex] = valueToStore;
      }
      return next;   
    });   
  }, [setDelivered, memberCount]);
  
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
    if(deliveredTot >= targetTotal) return {label:"Atingida",color:"bg-green-600"};
    if(deliveredTot >= targetTotal * 0.5) return {label:"Parcial",color:"bg-amber-500"};
    return {label:"Pendente",color:"bg-red-600"};
  }, [getMaterialTotalDelivered, totals]);
    
  const getMemberTotalDelivered = useCallback((memberIndex) => {  
      return Object.keys(delivered).reduce((sum, mat) => sum + (Number(delivered[mat]?.[memberIndex]) || 0), 0);
  }, [delivered]);

  const handleCloseMonth = useCallback(() => {
    if (memberCount === 0) {
        alert("Adicione membros primeiro.");
        return;
    }

    if (!window.confirm("ATENÇÃO: Você tem certeza que deseja fechar o mês atual? Isso salvará o progresso e ZERARÁ todos os campos de 'Controle de Entregas' para o novo ciclo.")) {
        return;
    }
    
    const now = new Date();
    const monthYear = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    
    const monthData = {
        id: Date.now(),
        label: monthYear.charAt(0).toUpperCase() + monthYear.slice(1), 
        date: now.toISOString(),
        members: currentRanking.map(r => ({...r})), 
    };
    
    setMonthlyHistory(prev => [monthData, ...prev]);
    
    // Zera as entregas no Firestore
    setDelivered(prev => {
        const next = {};
        Object.keys(totals).forEach(mat => {
            next[mat] = Array(memberCount).fill('');
        });
        return next;
    });
    
    alert(`Mês de ${monthData.label} fechado com sucesso! Entregas zeradas para o próximo ciclo.`);
    setActiveTab('Controle de Entregas');
  }, [memberCount, currentRanking, setMonthlyHistory, setDelivered, totals]);
  
  const handleAddMember = useCallback((name) => {
    setMemberNames(prev => [...prev, name]);
  }, [setMemberNames]);
  
  const handleRenameMember = useCallback((index, newName) => {
    setMemberNames(prev => prev.map((n, i) => (i === index ? newName : n)));
  }, [setMemberNames]);
  
  const handleRemoveMember = useCallback((indexToRemove) => {
    if (!window.confirm(`Tem certeza que deseja remover ${memberNames[indexToRemove]}? As entregas dele serão zeradas.`)) {
        return;
    }
  
    setMemberNames(prev => prev.filter((_, i) => i !== indexToRemove));
      
    // Zera as entregas do membro no Firestore
    setDelivered(prev => {  
        const next = {};  
        Object.keys(prev).forEach(mat => {  
            next[mat] = prev[mat].filter((_, i) => i !== indexToRemove);  
        });  
        return next;  
    });
    setViewingMemberIndex(null);
  }, [memberNames, setMemberNames, setDelivered]);


  // --- RESTANTE DO JSX (CONTEÚDO DAS ABAS) É MANTIDO (OMITIDO AQUI POR CONCISÃO) ---
  
  const renderContent = () => {
    // ... Código das abas (ConfigContent, ControlContent, StatusContent, etc.)
    // Como o código é longo, vou apenas reter as funções principais aqui
    // e pedir para o usuário COPIAR O BLOCO COMPLETO da resposta anterior.
    switch (activeTab) {
      case 'Configuração e Metas':
        // A CONTEÚDO CONFIG CONTENT COMPLETO DA RESPOSTA ANTERIOR
        break;
      case 'Controle de Entregas':
        // A CONTEÚDO CONTROL CONTENT COMPLETO DA RESPOSTA ANTERIOR
        break;
      case 'Resumo e Status':
        // A CONTEÚDO STATUS CONTENT COMPLETO DA RESPOSTA ANTERIOR
        break;
      case 'Ranking e Histórico':
        // A CONTEÚDO RANKING AND HISTORY CONTENT COMPLETO DA RESPOSTA ANTERIOR
        break;
      case 'Gerenciar Membros':
        // A CONTEÚDO MEMBER CONTENT COMPLETO DA RESPOSTA ANTERIOR
        break;
      default:
        // A CONTEÚDO CONTROL CONTENT COMPLETO DA RESPOSTA ANTERIOR
        break;
    }
    // ...
  };
  
  // --- Renderização (Loading e Error) ---
  if (loading) {
    return (
        <div className="text-center p-10 text-xl font-semibold text-indigo-700">
            Carregando Dados da Nuvem e Painel... (Se for a primeira vez, pode estar migrando dados locais.)
        </div>
    );
  }

  if (error) {
    return (
        <div className="text-center p-10 bg-red-100 border border-red-400 text-red-700 font-semibold rounded-lg">
            <h1 className="text-2xl mb-2">⚠️ Erro Crítico</h1>
            <p className="text-sm">Falha no Firebase Auth ou na conexão com o Firestore: {error}</p>
        </div>
    );
  }

  // --- Renderização Principal ---
  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-indigo-800 mb-6 border-b-2 border-indigo-200 pb-2">Controle de Farm (Sincronizado)</h1>
      <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
      {/* Aqui o renderContent deve chamar o JSX COMPLETO da sua última versão. */}
      {/* **AVISO:** Como eu não tenho o código completo das abas, vou re-incluir o código completo aqui abaixo para garantir que nada se perca! */}
      {/* NO SEU CASO, BASTA USAR O CÓDIGO FORNECIDO NO FINAL DA MINHA RESPOSTA */}
      {/* ... (Omissão do código longo das abas para a leitura do meu pensamento) ... */}

      {/* Como LLM, preciso garantir que o usuário não perdeu nada, então forneço o código completo novamente abaixo. */}
      {/* Em um cenário real, eu apenas diria: "Substitua o useLocalStorage e mantenha o resto do JSX." */}
    </div>
  );
}

// ... (Aqui precisaria do código completo do Tabs, ConfigContent, etc., que eu vou re-enviar para o usuário) ...


// --- 5. COMPONENTE DE ABAS ---
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
  
  
  // --- 6. CONTEÚDO DAS ABAS (JSX) ---
  
  const MemberProgressViewer = ({ memberIndex, memberNames, perMember, delivered, getStatusForMemberDelivery, getMemberTotalDelivered, setViewingMemberIndex }) => {
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

            <h4 className="font-semibold text-gray-700 mb-2">Status por Material:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {Object.keys(perMember).map(mat => {
                    const status = getStatusForMemberDelivery(mat, memberIndex);
                    const deliveredQty = Number(delivered[mat]?.[memberIndex]) || 0;
                    return (
                        <div key={mat} className={`flex justify-between p-3 border rounded-lg ${status.label === 'Atingida' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                            <span className="font-medium text-gray-700">{mat} (Meta: {perMember[mat]})</span>
                            <span className={`font-bold ${status.label === 'Atingida' ? 'text-green-700' : 'text-red-700'}`}>
                                {deliveredQty} / {perMember[mat]}
                                <span className={`ml-2 px-2 py-0.5 rounded-full text-white text-xs ${status.color}`}>
                                    {status.label === "Atingida" ? "✅" : status.label === "Parcial" ? "🟡" : "❌"}
                                </span>
                            </span>
                        </div>
                    );
                })}
            </div>
  
            <button   
                onClick={() => setViewingMemberIndex(null)}
                className="mt-2 px-4 py-2 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-600 transition duration-300"
            >
                Fechar Visualização
            </button>
        </div>
    );
  };
  
  
  function getJSXContent({ activeTab, production, updateProduction, memberCount, perMember, delivered, updateDelivered, memberNames, getMemberTotalDelivered, totals, getMaterialTotalDelivered, getStatusForTotalDelivery, handleCloseMonth, currentRanking, monthlyHistory, handleAddMember, handleRenameMember, handleRemoveMember, setViewingMemberIndex, viewingMemberIndex, getStatusForMemberDelivery }) {
    
    const ConfigContent = (
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">Configuração de Produção</h2>
        {Object.keys(production).map(prod=>(
          <div key={prod} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-3">
            <label className="w-full sm:w-32 text-gray-700 font-medium">{prod}</label>
            <input   
              type="text"
              inputMode="numeric"
              pattern="\d*"
              min={0}   
              value={production[prod]}   
              onChange={e=>updateProduction(prod,e.target.value)}   
              className="flex-grow border border-gray-300 rounded-lg px-3 py-2 text-right focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition duration-200"
            />
          </div>
        ))}
          
        <div className="mt-6">
          <h3 className="font-bold text-gray-700 mb-2">Metas por Pessoa (Total: {memberCount} Membros)</h3>
          {memberCount > 0 ? (
            <ul className="list-disc list-inside text-sm text-gray-600 grid grid-cols-2 gap-2">
              {Object.keys(perMember).map(mat=>(
                <li key={mat}>**{mat}**: {perMember[mat]} unidades</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-red-500 font-medium">⚠️ Adicione membros na aba 'Gerenciar Membros' para calcular as metas!</p>
          )}
        </div>
      </div>
    );
    
    const ControlContent = (
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">Registro de Entregas por Membro</h2>
        <p className="mb-4 text-sm text-gray-500 italic">**Digite aqui a quantidade de material entregue por cada membro.**</p>
        {memberCount === 0 ? (
          <div className="text-center p-8 bg-yellow-50 rounded-lg">
            <p className="text-lg font-semibold text-yellow-700">Por favor, adicione membros na aba "Gerenciar Membros" para começar o controle de entregas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Material</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">Meta / Membro</th>
                  {memberNames.map((n,i)=><th key={i} className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">{n}</th>)}
                </tr>
              </thead>
              <tbody>
              {Object.keys(perMember).map(mat=>{
                return (
                  <tr key={mat} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{mat}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-gray-600 font-semibold">{perMember[mat]}</td>
                    {memberNames.map((_,mi)=>{
                      return (
                        <td key={mi} className="border border-gray-200 px-1 py-1 text-center">
                            <input   
                                type="text"
                                inputMode="numeric"
                                pattern="\d*"
                                min={0}   
                                value={delivered[mat]?.[mi] ?? ''}   
                                onChange={e=>updateDelivered(mat,mi,e.target.value)}   
                                className="w-full text-right px-2 py-1 bg-gray-50 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition duration-150"
                            />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-100/70 border-t-2 border-indigo-300">
                  <td className="border border-gray-200 px-3 py-2 font-bold text-indigo-700 whitespace-nowrap">TOTAL ENTREGUE</td>
                  <td className="border border-gray-200 px-3 py-2 text-center font-bold text-indigo-700"></td>
                  {memberNames.map((_, mi) => (
                    <td key={mi} className="border border-gray-200 px-3 py-2 text-center font-bold text-indigo-700">
                      {getMemberTotalDelivered(mi)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
    
    const StatusContent = (
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">Progresso Geral da Semana</h2>
        <p className="mb-4 text-sm text-gray-500 italic">Visão consolidada do total de material entregue pela equipe.</p>
        <div className="space-y-4">
          {Object.keys(totals).map(mat=>{   
            const deliveredTot=getMaterialTotalDelivered(mat);   
            const pct=Math.min(100,totals[mat] > 0 ? Math.round((deliveredTot/totals[mat])*100) : 0);   
            const status = getStatusForTotalDelivery(mat);
            const barColor = status.color.replace('bg-', 'bg-');
              
            return (
              <div key={mat} className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-lg transition duration-200">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-gray-700">{mat}</div>
                  <div className="flex items-center">
                      <span className={`px-2 py-0.5 rounded-full text-white text-xs font-medium ${status.color}`}>
                          {status.label}
                      </span>
                      <span className="ml-3 font-bold text-lg text-indigo-600">{pct}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div   
                    style={{width:`${pct}%`}}   
                    className={`h-3 rounded-full ${barColor} transition-all duration-500 ease-out`}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1 flex justify-between">
                  <span>Total Entregue: **{deliveredTot}**</span>
                  <span>Meta Total: **{totals[mat]}**</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  
      const MonthlyHistoryTable = ({ history }) => {
          if (history.length === 0) {
              return <p className="text-gray-500 italic">Nenhum mês anterior encontrado. Feche o mês atual na seção acima para iniciar o histórico.</p>;
          }
      
          return (
              <div className="space-y-6">
                  {history.map(monthData => (
                      <div key={monthData.id} className="border border-indigo-300 rounded-xl p-4 bg-indigo-50/50">
                          <h4 className="text-lg font-bold text-indigo-700 mb-3 border-b pb-2 border-indigo-200">{monthData.label}</h4>
                          <div className="overflow-x-auto">
                              <table className="min-w-full table-auto text-sm">
                                  <thead>
                                      <tr className="bg-indigo-200">
                                          <th className="px-3 py-2 text-left font-semibold text-indigo-800">#</th>
                                          <th className="px-3 py-2 text-left font-semibold text-indigo-800">Membro</th>
                                          <th className="px-3 py-2 text-center font-semibold text-indigo-800">Entregue</th>
                                          <th className="px-3 py-2 text-center font-semibold text-indigo-800">Meta</th>
                                          <th className="px-3 py-2 text-center font-semibold text-indigo-800">% Concluído</th>
                                          <th className="px-3 py-2 text-center font-semibold text-indigo-800">Medalha</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {monthData.members.map((member, index) => (
                                          <tr key={index} className={`border-t border-indigo-100 ${index < 3 ? 'bg-yellow-50 font-medium' : 'hover:bg-indigo-100/50'}`}>
                                              <td className="px-3 py-2 text-center font-extrabold text-lg">{index + 1}</td>
                                              <td className="px-3 py-2 font-medium text-gray-700">{member.name}</td>
                                              <td className="px-3 py-2 text-center">{member.totalDelivered}</td>
                                              <td className="px-3 py-2 text-center">{member.totalTarget}</td>
                                              <td className="px-3 py-2 text-center font-bold text-indigo-600">{member.pct}%</td>
                                              <td className="px-3 py-2 text-center text-xl">{member.medal.split(' ')[0]}</td>
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
  
      const RankingAndHistoryContent = (
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 space-y-8">
              <h2 className="text-2xl font-bold mb-4 text-indigo-700 border-b pb-2">🏆 Ranking Atual e Histórico</h2>
              
              <div className="border border-green-300 rounded-xl p-4 bg-green-50/50">
                  <h3 className="text-xl font-bold mb-4 text-green-700">Ranking Atual (Progresso Individual)</h3>
                  
                  {currentRanking.length === 0 || memberCount === 0 ? (
                      <p className="text-sm text-red-500 font-medium">⚠️ Adicione membros e configure as metas na aba 'Configuração' para visualizar o ranking.</p>
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
                                      <tr key={item.index} className={`border-t border-gray-100 ${idx < 3 ? 'bg-yellow-50 font-bold' : 'hover:bg-gray-50'}`}>
                                          <td className="px-3 py-2 text-center font-extrabold text-lg">{idx + 1}</td>
                                          <td className="px-3 py-2 font-medium text-gray-800">{item.name}</td>
                                          <td className="px-3 py-2 text-center text-xl">{item.medal.split(' ')[0]}</td>
                                          <td className="px-3 py-2 text-center text-green-700">{item.totalDelivered}</td>
                                          <td className="px-3 py-2 text-center text-gray-500">{item.totalTarget}</td>
                                          <td className="px-3 py-2 text-center text-xl text-indigo-600 font-extrabold">{item.pct}%</td>
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
                      Ao fechar o mês, o progresso atual é salvo no histórico e todos os campos de entrega (Controle de Entregas) são zerados, iniciando um novo ciclo de farm.
                  </p>
                  <button
                      onClick={handleCloseMonth}
                      disabled={memberCount === 0 || Object.keys(totals).length === 0 || Object.values(totals).every(t => t === 0)}
                      className="px-6 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition duration-300 disabled:bg-red-300"
                  >
                      🗓️ Fechar Mês Atual e Zerar Entregas
                  </button>
                  {Object.values(totals).every(t => t === 0) && memberCount > 0 && (
                      <p className="text-sm text-red-500 mt-2">⚠️ Configure metas na aba 'Configuração' antes de fechar o mês (Metas atuais estão em 0).</p>
                  )}
              </div>
              
              <div className="pt-6 border-t border-gray-200">
                  <h3 className="text-xl font-bold mb-4 text-indigo-600">Histórico de Meses Anteriores</h3>
                  <MonthlyHistoryTable history={monthlyHistory} />
              </div>
          </div>
      );
  
      const MemberContent = (
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
              <h2 className="text-xl font-bold mb-4 text-indigo-600">Gerenciar Membros da Equipe</h2>
              
              <div className="mb-6 pb-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-700 mb-2">Adicionar Novo Membro</h3>
                  <form onSubmit={(e) => {
                      e.preventDefault();
                      const newName = e.target.newMemberName.value.trim();
                      if (newName) {
                          handleAddMember(newName);
                          e.target.newMemberName.value = '';
                      }
                  }} className="flex gap-2">
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
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                          <span className="font-medium text-gray-800 flex-1">
                              {index + 1}. {name}
                          </span>
                          <div className="flex gap-2">
                              <button
                                  onClick={() => setViewingMemberIndex(index)}
                                  className="text-sm px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition"
                                  title="Ver Progresso"
                              >
                                  Ver Progresso
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
                                  className="w-24 text-sm border border-gray-300 rounded px-2 py-1 text-center focus:ring-1 focus:ring-indigo-300"
                                  title="Clique para renomear"
                              />
                              
                              <button
                                  onClick={() => handleRemoveMember(index)}
                                  className="text-sm px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                                  title="Remover Membro"
                              >
                                  Remover
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
  
              {viewingMemberIndex !== null && <MemberProgressViewer memberIndex={viewingMemberIndex} memberNames={memberNames} perMember={perMember} delivered={delivered} getStatusForMemberDelivery={getStatusForMemberDelivery} getMemberTotalDelivered={getMemberTotalDelivered} setViewingMemberIndex={setViewingMemberIndex} />}
          </div>
      );

      switch (activeTab) {
          case 'Configuração e Metas':
              return ConfigContent;
          case 'Controle de Entregas':
              return ControlContent;
          case 'Resumo e Status':
              return StatusContent;
          case 'Ranking e Histórico':
              return RankingAndHistoryContent;
          case 'Gerenciar Membros':
              return MemberContent;
          default:
              return ControlContent;
      }
  };

  // --- Funções de Manipulação de Dados (Continuam no componente principal) ---
  // ... (funções como updateProduction, updateDelivered, etc, já estão lá em cima) ...

  const componentProps = {
    activeTab, production, updateProduction, memberCount, perMember, delivered, updateDelivered, 
    memberNames, getMemberTotalDelivered, totals, getMaterialTotalDelivered, getStatusForTotalDelivery, 
    handleCloseMonth, currentRanking, monthlyHistory, handleAddMember, handleRenameMember, handleRemoveMember, 
    setViewingMemberIndex, viewingMemberIndex, getStatusForMemberDelivery
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-indigo-800 mb-6 border-b-2 border-indigo-200 pb-2">Controle de Farm (Sincronizado)</h1>
      <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
      {getJSXContent(componentProps)}
    </div>
  );
}

export default FarmDashboard;
```Essa é a próxima etapa crucial para o seu aplicativo! Se o painel não está atualizando automaticamente em outros dispositivos, é porque os dados estão salvos apenas no seu navegador local (`LocalStorage`).

Para que o painel atualize para todos os membros da sua equipe em tempo real, precisamos migrar o armazenamento de dados para o **Firestore** (o banco de dados em nuvem do Firebase que já está configurado no seu projeto).

Eu atualizei o código de **`src/FarmDashboard.jsx`** para usar o Firestore. Ele fará o seguinte:

1.  **Migrar Automaticamente:** Na primeira vez que você abrir o site, ele pegará os seus dados antigos do `LocalStorage` e os salvará na nuvem.
2.  **Sincronizar em Tempo Real:** A partir de agora, qualquer alteração feita por qualquer pessoa no site será salva no Firestore e enviada automaticamente para todos os outros usuários.

### 🛠️ Código para `src/FarmDashboard.jsx` (Sincronização em Nuvem)

Por favor, substitua **TODO** o conteúdo do seu arquivo **`src/FarmDashboard.jsx`** pelo código abaixo. Ele contém a nova lógica de sincronização com o Firestore mais o código completo de todas as abas (Configuração, Controle de Entregas, etc.) que você já tinha.

```jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from 'firebase/auth';
// Importação de funções do Firestore
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'; 

// --- CONFIGURAÇÃO FIREBASE ---
const USER_FIREBASE_CONFIG = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(USER_FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 1. RECEITAS E CONSTANTES ---
const RECIPES = {
  Colete: { Borracha: 10, "Plástico": 10, Alumínio: 20, Ferro: 20, Tecido: 1 },
  Algema: { Borracha: 20, "Plástico": 20, Alumínio: 25, Cobre: 25, Ferro: 30 },
  Capuz: { Borracha: 10, "Plástico": 10, Tecido: 1 },
  "Flipper MK3": { Alumínio: 25, Ferro: 25, Cobre: 25, "Emb. Plástica": 25, Titânio: 1 }
};

const TABS = ['Configuração e Metas', 'Controle de Entregas', 'Resumo e Status', 'Ranking e Histórico', 'Gerenciar Membros'];

// --- 2. HOOK CUSTOMIZADO PARA SINCRONIZAÇÃO EM NUVEM (Firestore) ---
function useFirestoreSync(docName, initialValue, isShared = true) {
    const [data, setData] = useState(initialValue);
    const [loading, setLoading] = useState(true);
    // Cria uma referência ao documento único na coleção 'farmData'
    const docRef = doc(db, 'farmData', docName); 

    // Função para escrever no Firestore
    const updateData = useCallback(async (newValue) => {
        const valueToStore = newValue instanceof Function ? newValue(data) : newValue;
        setData(valueToStore);
        try {
            if (isShared) { 
                // Salva na nuvem, sobrescrevendo o valor
                await setDoc(docRef, { value: valueToStore }, { merge: false });
            }
        } catch (error) {
            console.error(`Erro ao salvar ${docName} no Firestore:`, error);
        }
    }, [docRef, data, isShared]);
    
    // Efeito para carregar dados (LocalStorage -> Firestore) e sincronizar
    useEffect(() => {
        let unsubscribe;
        const loadAndSync = async () => {
            setLoading(true);
            
            // Tenta carregar do LocalStorage (para migração inicial)
            const localData = window.localStorage.getItem(`farm_${docName}`);
            let initialLoadValue = initialValue;

            if (localData) {
                try {
                    initialLoadValue = JSON.parse(localData);
                    console.log(`Dados ${docName} carregados do LocalStorage para possível migração.`);
                } catch (e) {
                    console.error("Erro ao parsear LocalStorage", e);
                }
            }

            // 1. Carregar/Migrar para o Firestore
            try {
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    // Já existe no Firestore, usa o valor da nuvem
                    initialLoadValue = docSnap.data().value;
                    console.log(`Dados ${docName} carregados do Firestore.`);
                } else if (localData) {
                    // Não existe na nuvem, mas existe localmente: MIGRAÇÃO
                    await setDoc(docRef, { value: initialLoadValue });
                    console.log(`Migração inicial de ${docName} do LocalStorage para Firestore concluída.`);
                    window.localStorage.removeItem(`farm_${docName}`); // Limpa o local
                } else {
                    // Não existe em lugar nenhum, salva o valor inicial na nuvem
                    await setDoc(docRef, { value: initialLoadValue });
                }
            } catch (err) {
                console.error(`Erro inicial de carregamento/migração de ${docName}. Usando valor local.`, err);
                // Em caso de erro, apenas continua com o valor que já temos
            }

            // 2. Setup Listener (Sincronização em Tempo Real)
            if (isShared) {
                // Configura o listener que atualiza o estado DATA sempre que o documento mudar na nuvem
                unsubscribe = onSnapshot(docRef, (doc) => {
                    if (doc.exists()) {
                        const cloudValue = doc.data().value;
                        setData(cloudValue);
                    } else {
                        // Se o documento for deletado, volta ao valor inicial
                        setData(initialValue);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error(`Erro de sincronização em tempo real para ${docName}:`, error);
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        };

        loadAndSync();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [docRef, docName, initialValue, isShared]);

    return [data, updateData, loading];
}


// --- 3. FUNÇÕES DE CÁLCULO E UTILITÁRIOS ---
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


// --- 4. COMPONENTE PRINCIPAL (FarmDashboard) ---
function FarmDashboard() {
  // ATUALIZADO: Usando useFirestoreSync para dados compartilhados (production, memberNames, delivered)
  const [production, setProduction, loadingProduction] = useFirestoreSync('production', { Colete: 200, Algema: 100, Capuz: 50, "Flipper MK3": 20 });
  const [memberNames, setMemberNames, loadingMembers] = useFirestoreSync('memberNames', ['Membro 1', 'Membro 2', 'Membro 3', 'Membro 4', 'Membro 5', 'Membro 6', 'Membro 7', 'Membro 8']);
  const [delivered, setDelivered, loadingDelivered] = useFirestoreSync('delivered', {});
  
  // O histórico mensal (monthlyHistory) não precisa de sincronização em tempo real. Mantido em LocalStorage para simplicidade, mas pode ser migrado para Firestore se necessário.
  const [monthlyHistory, setMonthlyHistory] = useState(() => {
    try {
        const item = window.localStorage.getItem('farm_monthly_history');
        // Adicionando verificação para garantir que o array está correto
        const initialData = item ? JSON.parse(item) : [];
        return Array.isArray(initialData) ? initialData : [];
    } catch (e) { return []; }
  });
  useEffect(() => {
    window.localStorage.setItem('farm_monthly_history', JSON.stringify(monthlyHistory));
  }, [monthlyHistory]);
    
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('Controle de Entregas'); 
  const [viewingMemberIndex, setViewingMemberIndex] = useState(null); 
  
  const memberCount = memberNames.length;
  
  const totals = useMemo(()=>sumMaterials(production),[production]);
  const perMember = useMemo(()=>{   
    if(memberCount === 0) return {};
    const r={};   
    Object.entries(totals).forEach(([m,t])=>r[m]=ceilDivide(t,memberCount));   
    return r;   
  },[totals, memberCount]);

  const currentRanking = useMemo(() => calculateRanking(memberNames, perMember, delivered), [memberNames, perMember, delivered]);
  
  // O estado geral de carregamento considera a autenticação e o carregamento dos 3 documentos do Firestore
  const loading = loadingProduction || loadingMembers || loadingDelivered || authLoading;

  // Efeito de Inicialização e Autenticação (Firebase)
  useEffect(() => {
    const authenticate = async () => {
        try {
            await setPersistence(auth, browserLocalPersistence);
            await signInAnonymously(auth); 
            setIsLoggedIn(true);
        } catch (err) {
            console.error("Erro no Painel (Firebase Auth):", err);
            setError("Erro no Firebase Auth. Verifique as chaves e a ativação de login anônimo: " + err.message);
        } finally {
            setAuthLoading(false);
        }
    };
    authenticate();
  }, []); 

  // Efeito para Sincronizar 'delivered' e 'memberCount' (Ajuste a estrutura ao carregar)
  useEffect(()=>{  
    // Esta lógica é importante para garantir que o array 'delivered' tenha o tamanho certo
    // de acordo com memberNames carregado do Firestore.
    setDelivered(prev => {   
      const next = {};   
      const currentMaterials = Object.keys(totals);  
        
      currentMaterials.forEach(mat => {  
          const previousDeliveries = prev[mat] || [];
          next[mat] = Array.from({length: memberCount}, (_, i) => previousDeliveries[i] ?? '');
      });
        
      Object.keys(prev).forEach(mat => {
          if (!currentMaterials.includes(mat)) {
              delete next[mat];
          }
      });
        
      return next;   
    });  
  
    if (viewingMemberIndex !== null && viewingMemberIndex >= memberCount) {  
        setViewingMemberIndex(null);
    }
  },[memberCount, totals, setDelivered, viewingMemberIndex, loadingMembers]);


  
  // --- Funções de Manipulação de Dados ---
    
  const updateProduction = useCallback((product, value) => {   
      const sanitizedValue = value === '' || (!isNaN(Number(value)) && Number(value) >= 0) ? value : production[product];
      setProduction(p=>({...p,[product]:sanitizedValue}));   
  }, [production, setProduction]);
  
  const updateDelivered = useCallback((material, memberIndex, value) => {   
    setDelivered(d => {   
      const valueToStore = (value === '' || (value === '0') || (!isNaN(Number(value)) && Number(value) >= 0)) ? value : (d[material]?.[memberIndex] ?? '');
  
      const next = {...d};   
      next[material] = next[material] ? [...next[material]] : Array(memberCount).fill('');   
      
      if (memberIndex < memberCount) {
        next[material][memberIndex] = valueToStore;
      }
      return next;   
    });   
  }, [setDelivered, memberCount]);
  
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
    if(deliveredTot >= targetTotal) return {label:"Atingida",color:"bg-green-600"};
    if(deliveredTot >= targetTotal * 0.5) return {label:"Parcial",color:"bg-amber-500"};
    return {label:"Pendente",color:"bg-red-600"};
  }, [getMaterialTotalDelivered, totals]);
    
  const getMemberTotalDelivered = useCallback((memberIndex) => {  
      return Object.keys(delivered).reduce((sum, mat) => sum + (Number(delivered[mat]?.[memberIndex]) || 0), 0);
  }, [delivered]);

  const handleCloseMonth = useCallback(() => {
    if (memberCount === 0) {
        alert("Adicione membros primeiro.");
        return;
    }

    if (!window.confirm("ATENÇÃO: Você tem certeza que deseja fechar o mês atual? Isso salvará o progresso e ZERARÁ todos os campos de 'Controle de Entregas' para o novo ciclo.")) {
        return;
    }
    
    const now = new Date();
    const monthYear = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    
    const monthData = {
        id: Date.now(),
        label: monthYear.charAt(0).toUpperCase() + monthYear.slice(1), 
        date: now.toISOString(),
        members: currentRanking.map(r => ({...r})), 
    };
    
    setMonthlyHistory(prev => [monthData, ...prev]);
    
    // Zera as entregas no Firestore
    setDelivered(prev => {
        const next = {};
        Object.keys(totals).forEach(mat => {
            next[mat] = Array(memberCount).fill('');
        });
        return next;
    });
    
    alert(`Mês de ${monthData.label} fechado com sucesso! Entregas zeradas para o próximo ciclo.`);
    setActiveTab('Controle de Entregas');
  }, [memberCount, currentRanking, setMonthlyHistory, setDelivered, totals]);
  
  const handleAddMember = useCallback((name) => {
    setMemberNames(prev => [...prev, name]);
  }, [setMemberNames]);
  
  const handleRenameMember = useCallback((index, newName) => {
    setMemberNames(prev => prev.map((n, i) => (i === index ? newName : n)));
  }, [setMemberNames]);
  
  const handleRemoveMember = useCallback((indexToRemove) => {
    if (!window.confirm(`Tem certeza que deseja remover ${memberNames[indexToRemove]}? As entregas dele serão zeradas.`)) {
        return;
    }
  
    setMemberNames(prev => prev.filter((_, i) => i !== indexToRemove));
      
    // Zera as entregas do membro no Firestore
    setDelivered(prev => {  
        const next = {};  
        Object.keys(prev).forEach(mat => {  
            next[mat] = prev[mat].filter((_, i) => i !== indexToRemove);  
        });  
        return next;  
    });
    setViewingMemberIndex(null);
  }, [memberNames, setMemberNames, setDelivered]);


  // --- COMPONENTES JSX (ABAS) ---
  
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

            <h4 className="font-semibold text-gray-700 mb-2">Status por Material:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {Object.keys(perMember).map(mat => {
                    const status = getStatusForMemberDelivery(mat, memberIndex);
                    const deliveredQty = Number(delivered[mat]?.[memberIndex]) || 0;
                    return (
                        <div key={mat} className={`flex justify-between p-3 border rounded-lg ${status.label === 'Atingida' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                            <span className="font-medium text-gray-700">{mat} (Meta: {perMember[mat]})</span>
                            <span className={`font-bold ${status.label === 'Atingida' ? 'text-green-700' : 'text-red-700'}`}>
                                {deliveredQty} / {perMember[mat]}
                                <span className={`ml-2 px-2 py-0.5 rounded-full text-white text-xs ${status.color}`}>
                                    {status.label === "Atingida" ? "✅" : status.label === "Parcial" ? "🟡" : "❌"}
                                </span>
                            </span>
                        </div>
                    );
                })}
            </div>
  
            <button   
                onClick={() => setViewingMemberIndex(null)}
                className="mt-2 px-4 py-2 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-600 transition duration-300"
            >
                Fechar Visualização
            </button>
        </div>
    );
  };
  
  const ConfigContent = (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-indigo-600">Configuração de Produção</h2>
      {Object.keys(production).map(prod=>(
        <div key={prod} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-3">
          <label className="w-full sm:w-32 text-gray-700 font-medium">{prod}</label>
          <input   
            type="text"
            inputMode="numeric"
            pattern="\d*"
            min={0}   
            value={production[prod]}   
            onChange={e=>updateProduction(prod,e.target.value)}   
            className="flex-grow border border-gray-300 rounded-lg px-3 py-2 text-right focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition duration-200"
          />
        </div>
      ))}
        
      <div className="mt-6">
        <h3 className="font-bold text-gray-700 mb-2">Metas por Pessoa (Total: {memberCount} Membros)</h3>
        {memberCount > 0 ? (
          <ul className="list-disc list-inside text-sm text-gray-600 grid grid-cols-2 gap-2">
            {Object.keys(perMember).map(mat=>(
              <li key={mat}>**{mat}**: {perMember[mat]} unidades</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-red-500 font-medium">⚠️ Adicione membros na aba 'Gerenciar Membros' para calcular as metas!</p>
        )}
      </div>
    </div>
  );
  
  const ControlContent = (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-indigo-600">Registro de Entregas por Membro</h2>
      <p className="mb-4 text-sm text-gray-500 italic">**Digite aqui a quantidade de material entregue por cada membro.**</p>
      {memberCount === 0 ? (
        <div className="text-center p-8 bg-yellow-50 rounded-lg">
          <p className="text-lg font-semibold text-yellow-700">Por favor, adicione membros na aba "Gerenciar Membros" para começar o controle de entregas.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Material</th>
                <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">Meta / Membro</th>
                {memberNames.map((n,i)=><th key={i} className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">{n}</th>)}
              </tr>
            </thead>
            <tbody>
            {Object.keys(perMember).map(mat=>{
              return (
                <tr key={mat} className="hover:bg-gray-50 transition-colors duration-150">
                  <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{mat}</td>
                  <td className="border border-gray-200 px-3 py-2 text-center text-gray-600 font-semibold">{perMember[mat]}</td>
                  {memberNames.map((_,mi)=>{
                    return (
                      <td key={mi} className="border border-gray-200 px-1 py-1 text-center">
                          <input   
                              type="text"
                              inputMode="numeric"
                              pattern="\d*"
                              min={0}   
                              value={delivered[mat]?.[mi] ?? ''}   
                              onChange={e=>updateDelivered(mat,mi,e.target.value)}   
                              className="w-full text-right px-2 py-1 bg-gray-50 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition duration-150"
                          />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-100/70 border-t-2 border-indigo-300">
                <td className="border border-gray-200 px-3 py-2 font-bold text-indigo-700 whitespace-nowrap">TOTAL ENTREGUE</td>
                <td className="border border-gray-200 px-3 py-2 text-center font-bold text-indigo-700"></td>
                {memberNames.map((_, mi) => (
                  <td key={mi} className="border border-gray-200 px-3 py-2 text-center font-bold text-indigo-700">
                    {getMemberTotalDelivered(mi)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
  
  const StatusContent = (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-indigo-600">Progresso Geral da Semana</h2>
      <p className="mb-4 text-sm text-gray-500 italic">Visão consolidada do total de material entregue pela equipe.</p>
      <div className="space-y-4">
        {Object.keys(totals).map(mat=>{   
          const deliveredTot=getMaterialTotalDelivered(mat);   
          const pct=Math.min(100,totals[mat] > 0 ? Math.round((deliveredTot/totals[mat])*100) : 0);   
          const status = getStatusForTotalDelivery(mat);
          const barColor = status.color.replace('bg-', 'bg-');
            
          return (
            <div key={mat} className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-lg transition duration-200">
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-gray-700">{mat}</div>
                <div className="flex items-center">
                    <span className={`px-2 py-0.5 rounded-full text-white text-xs font-medium ${status.color}`}>
                        {status.label}
                    </span>
                    <span className="ml-3 font-bold text-lg text-indigo-600">{pct}%</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div   
                  style={{width:`${pct}%`}}   
                  className={`h-3 rounded-full ${barColor} transition-all duration-500 ease-out`}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1 flex justify-between">
                <span>Total Entregue: **{deliveredTot}**</span>
                <span>Meta Total: **{totals[mat]}**</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

    const MonthlyHistoryTable = ({ history }) => {
        if (history.length === 0) {
            return <p className="text-gray-500 italic">Nenhum mês anterior encontrado. Feche o mês atual na seção acima para iniciar o histórico.</p>;
        }
    
        return (
            <div className="space-y-6">
                {history.map(monthData => (
                    <div key={monthData.id} className="border border-indigo-300 rounded-xl p-4 bg-indigo-50/50">
                        <h4 className="text-lg font-bold text-indigo-700 mb-3 border-b pb-2 border-indigo-200">{monthData.label}</h4>
                        <div className="overflow-x-auto">
                            <table className="min-w-full table-auto text-sm">
                                <thead>
                                    <tr className="bg-indigo-200">
                                        <th className="px-3 py-2 text-left font-semibold text-indigo-800">#</th>
                                        <th className="px-3 py-2 text-left font-semibold text-indigo-800">Membro</th>
                                        <th className="px-3 py-2 text-center font-semibold text-indigo-800">Entregue</th>
                                        <th className="px-3 py-2 text-center font-semibold text-indigo-800">Meta</th>
                                        <th className="px-3 py-2 text-center font-semibold text-indigo-800">% Concluído</th>
                                        <th className="px-3 py-2 text-center font-semibold text-indigo-800">Medalha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthData.members.map((member, index) => (
                                        <tr key={index} className={`border-t border-indigo-100 ${index < 3 ? 'bg-yellow-50 font-medium' : 'hover:bg-indigo-100/50'}`}>
                                            <td className="px-3 py-2 text-center font-extrabold text-lg">{index + 1}</td>
                                            <td className="px-3 py-2 font-medium text-gray-700">{member.name}</td>
                                            <td className="px-3 py-2 text-center">{member.totalDelivered}</td>
                                            <td className="px-3 py-2 text-center">{member.totalTarget}</td>
                                            <td className="px-3 py-2 text-center font-bold text-indigo-600">{member.pct}%</td>
                                            <td className="px-3 py-2 text-center text-xl">{member.medal.split(' ')[0]}</td>
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

    const RankingAndHistoryContent = (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 space-y-8">
            <h2 className="text-2xl font-bold mb-4 text-indigo-700 border-b pb-2">🏆 Ranking Atual e Histórico</h2>
            
            <div className="border border-green-300 rounded-xl p-4 bg-green-50/50">
                <h3 className="text-xl font-bold mb-4 text-green-700">Ranking Atual (Progresso Individual)</h3>
                
                {currentRanking.length === 0 || memberCount === 0 ? (
                    <p className="text-sm text-red-500 font-medium">⚠️ Adicione membros e configure as metas na aba 'Configuração' para visualizar o ranking.</p>
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
                                    <tr key={item.index} className={`border-t border-gray-100 ${idx < 3 ? 'bg-yellow-50 font-bold' : 'hover:bg-gray-50'}`}>
                                        <td className="px-3 py-2 text-center font-extrabold text-lg">{idx + 1}</td>
                                        <td className="px-3 py-2 font-medium text-gray-800">{item.name}</td>
                                        <td className="px-3 py-2 text-center text-xl">{item.medal.split(' ')[0]}</td>
                                        <td className="px-3 py-2 text-center text-green-700">{item.totalDelivered}</td>
                                        <td className="px-3 py-2 text-center text-gray-500">{item.totalTarget}</td>
                                        <td className="px-3 py-2 text-center text-xl text-indigo-600 font-extrabold">{item.pct}%</td>
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
                    Ao fechar o mês, o progresso atual é salvo no histórico e todos os campos de entrega (Controle de Entregas) são zerados, iniciando um novo ciclo de farm.
                </p>
                <button
                    onClick={handleCloseMonth}
                    disabled={memberCount === 0 || Object.keys(totals).length === 0 || Object.values(totals).every(t => t === 0)}
                    className="px-6 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition duration-300 disabled:bg-red-300"
                >
                    🗓️ Fechar Mês Atual e Zerar Entregas
                </button>
                {Object.values(totals).every(t => t === 0) && memberCount > 0 && (
                    <p className="text-sm text-red-500 mt-2">⚠️ Configure metas na aba 'Configuração' antes de fechar o mês (Metas atuais estão em 0).</p>
                )}
            </div>
            
            <div className="pt-6 border-t border-gray-200">
                <h3 className="text-xl font-bold mb-4 text-indigo-600">Histórico de Meses Anteriores</h3>
                <MonthlyHistoryTable history={monthlyHistory} />
            </div>
        </div>
    );

  const MemberContent = (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">Gerenciar Membros da Equipe</h2>
        
        <div className="mb-6 pb-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-700 mb-2">Adicionar Novo Membro</h3>
            <form onSubmit={(e) => {
                e.preventDefault();
                const newName = e.target.newMemberName.value.trim();
                if (newName) {
                    handleAddMember(newName);
                    e.target.newMemberName.value = '';
                }
            }} className="flex gap-2">
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
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="font-medium text-gray-800 flex-1">
                        {index + 1}. {name}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewingMemberIndex(index)}
                            className="text-sm px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition"
                            title="Ver Progresso"
                        >
                            Ver Progresso
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
                            className="w-24 text-sm border border-gray-300 rounded px-2 py-1 text-center focus:ring-1 focus:ring-indigo-300"
                            title="Clique para renomear"
                        />
                        
                        <button
                            onClick={() => handleRemoveMember(index)}
                            className="text-sm px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                            title="Remover Membro"
                        >
                            Remover
                        </button>
                    </div>
                </div>
            ))}
        </div>

        {viewingMemberIndex !== null && <MemberProgressViewer memberIndex={viewingMemberIndex} />}
    </div>
  );
  
  const renderContent = () => {
    switch (activeTab) {
      case 'Configuração e Metas':
        return ConfigContent;
      case 'Controle de Entregas':
        return ControlContent;
      case 'Resumo e Status':
        return StatusContent;
      case 'Ranking e Histórico':
        return RankingAndHistoryContent;
      case 'Gerenciar Membros':
        return MemberContent;
      default:
        return ControlContent;
    }
  };
  
  if (loading) {
    return (
        <div className="text-center p-10 text-xl font-semibold text-indigo-700">
            Carregando Dados da Nuvem e Painel... (Se for a primeira vez, pode estar migrando dados locais.)
        </div>
    );
  }

  if (error) {
    return (
        <div className="text-center p-10 bg-red-100 border border-red-400 text-red-700 font-semibold rounded-lg">
            <h1 className="text-2xl mb-2">⚠️ Erro Crítico</h1>
            <p className="text-sm">Falha no Firebase Auth ou na conexão com o Firestore: {error}</p>
        </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-indigo-800 mb-6 border-b-2 border-indigo-200 pb-2">Controle de Farm (Sincronizado)</h1>
      <Tabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
      {renderContent()}
    </div>
  );
}

// --- Componente de Abas fora do componente principal ---
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

export default FarmDashboard;
