// =================================================================
// CÓDIGO CORRIGIDO PARA src/FarmDashboard.jsx
// =================================================================

// 1. TODAS AS IMPORTAÇÕES (NO TOPO)
// -----------------------------------------------------------------
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'; 

// 2. CONSTANTES E CONFIGURAÇÕES (GLOBAL)
// -----------------------------------------------------------------
const USER_FIREBASE_CONFIG = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const FIREBASE_APP_ID = USER_FIREBASE_CONFIG.appId;

const RECIPES = {
  Colete: { Borracha: 10, "Plástico": 10, Alumínio: 20, Ferro: 20, Tecido: 1 },
  Algema: { Borracha: 20, "Plástico": 20, Alumínio: 25, Cobre: 25, Ferro: 30 },
  Capuz: { Borracha: 10, "Plástico": 10, Tecido: 1 },
  "Flipper MK3": { Alumínio: 25, Ferro: 25, Cobre: 25, "Emb. Plástica": 25, Titânio: 1 }
};

const TABS = ['Configuração e Metas', 'Controle de Entregas', 'Resumo e Status', 'Ranking e Histórico', 'Gerenciar Membros'];

// 3. INICIALIZAÇÃO DO FIREBASE (GLOBAL)
// -----------------------------------------------------------------
// NOTA: Estas variáveis globais serão usadas pelos Hooks
const app = initializeApp(USER_FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// 4. FUNÇÕES DE CÁLCULO E UTILITÁRIOS (GLOBAL)
// -----------------------------------------------------------------
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

// 5. HOOKS E COMPONENTES AUXILIARES (FORA DO COMPONENTE PRINCIPAL)
// -----------------------------------------------------------------

/**
 * HOOK CORRIGIDO: Agora usa 'db' e 'FIREBASE_APP_ID' do escopo global.
 */
function useFirestoreSync(docName, initialValue, isShared = true) {
    const [data, setData] = useState(initialValue);
    const [loading, setLoading] = useState(true);
    
    // Garante que a referência do documento é estável
    const docRef = useMemo(() => {
        const collectionPath = `artifacts/${FIREBASE_APP_ID}/public/data/farmData`; 
        return doc(db, collectionPath, docName); 
    }, [docName]);

    const updateData = useCallback(async (newValue) => {
        const valueToStore = newValue instanceof Function ? newValue(data) : newValue;
        setData(valueToStore);
        try {
            if (isShared) { 
                await setDoc(docRef, { value: valueToStore }, { merge: false });
            }
        } catch (error) {
            console.error(`Erro ao salvar ${docName} no Firestore:`, error);
        }
    }, [docRef, data, isShared]);
    
    useEffect(() => {
        let unsubscribe;
        const loadAndSync = async () => {
            setLoading(true);
            
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

            try {
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    initialLoadValue = docSnap.data().value;
                    console.log(`Dados ${docName} carregados do Firestore.`);
                } else if (localData) {
                    await setDoc(docRef, { value: initialLoadValue });
                    console.log(`Migração inicial de ${docName} do LocalStorage para Firestore concluída.`);
                    window.localStorage.removeItem(`farm_${docName}`); 
                } else {
                    await setDoc(docRef, { value: initialLoadValue });
                }
            } catch (err) {
                console.error(`Erro inicial de carregamento/migração de ${docName}. Usando valor local.`, err);
            }

            if (isShared) {
                unsubscribe = onSnapshot(docRef, (doc) => {
                    if (doc.exists()) {
                        const cloudValue = doc.data().value;
                        setData(cloudValue);
                    } else {
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

function MonthlyHistoryTable({ history }) {
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
}

// 6. COMPONENTE PRINCIPAL (FarmDashboard)
// -----------------------------------------------------------------
function FarmDashboard() {
  // AQUI SÓ CHAMAMOS OS HOOKS
  const [production, setProduction, loadingProduction] = useFirestoreSync('production', { Colete: 200, Algema: 100, Capuz: 50, "Flipper MK3": 20 });
  const [memberNames, setMemberNames, loadingMembers] = useFirestoreSync('memberNames', ['Membro 1', 'Membro 2', 'Membro 3', 'Membro 4', 'Membro 5', 'Membro 6', 'Membro 7', 'Membro 8']);
  const [delivered, setDelivered, loadingDelivered] = useFirestoreSync('delivered', {});
  
  const [monthlyHistory, setMonthlyHistory] = useState(() => {
    try {
        const item = window.localStorage.getItem('farm_monthly_history');
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
  
  // LOGIC & MEMOS
  const memberCount = memberNames.length;
  
  const totals = useMemo(()=>sumMaterials(production),[production]);
  const perMember = useMemo(()=>{   
    if(memberCount === 0) return {};
    const r={};   
    Object.entries(totals).forEach(([m,t])=>r[m]=ceilDivide(t,memberCount));   
    return r;   
  },[totals, memberCount]);

  const currentRanking = useMemo(() => calculateRanking(memberNames, perMember, delivered), [memberNames, perMember, delivered]);
  
  const dataLoadingCompleted = !loadingProduction && !loadingMembers && !loadingDelivered; 
  const loading = authLoading || loadingProduction || loadingMembers || loadingDelivered; 

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
    if (dataLoadingCompleted) {
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
    }
  },[memberCount, totals, setDelivered, viewingMemberIndex, dataLoadingCompleted]);


  
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


  // --- CONTEÚDO JSX DAS ABAS ---
  
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
                        className="h-3 rounded-full bg-indigo-500 transition-all duration-
