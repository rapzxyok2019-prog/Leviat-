// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB2mlLKLqVwvx7FMq8qLkYAwHLkjljDYIU",
  authDomain: "controle-de-farm-leviata.firebaseapp.com",
  projectId: "controle-de-farm-leviata",
  storageBucket: "controle-de-farm-leviata.firebasestorage.app",
  messagingSenderId: "736608761330",
  appId: "1:736608761330:web:3e7193c697eea4ff7e676b"
};

// Inicializar Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let dadosMedicamentos = [];
let editandoIndex = null;
let editandoId = null;

// Elementos DOM
const formulario = document.getElementById('medicamentoForm');
const listaMedicamentos = document.getElementById('listaMedicamentos');
const btnSalvar = document.getElementById('btnSalvar');
const btnCancelar = document.getElementById('btnCancelar');

// Carregar dados do Firestore
async function carregarDados() {
    try {
        console.log('Carregando dados do Firestore...');
        
        const snapshot = await db.collection('medicamentos').orderBy('timestamp', 'desc').get();
        dadosMedicamentos = [];
        
        snapshot.forEach(doc => {
            dadosMedicamentos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log('Dados carregados:', dadosMedicamentos);
        exibirMedicamentos();
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Erro ao carregar dados do servidor. Verifique o console.');
    }
}

// Exibir medicamentos
function exibirMedicamentos() {
    if (!listaMedicamentos) {
        console.error('Elemento listaMedicamentos não encontrado');
        return;
    }
    
    listaMedicamentos.innerHTML = '';
    
    if (dadosMedicamentos.length === 0) {
        listaMedicamentos.innerHTML = '<li class="sem-dados">Nenhum medicamento cadastrado</li>';
        return;
    }
    
    dadosMedicamentos.forEach((med, index) => {
        const li = document.createElement('li');
        li.className = 'medicamento-item';
        li.innerHTML = `
            <div class="med-info">
                <strong>${med.nome}</strong>
                <span>Qtd: ${med.quantidade}</span>
                <span>R$ ${typeof med.preco === 'number' ? med.preco.toFixed(2) : '0.00'}</span>
                <span>${med.fornecedor || ''}</span>
                <span class="categoria">${med.categoria || ''}</span>
            </div>
            <div class="med-actions">
                <button class="btn-editar" onclick="editarMedicamento('${med.id}', ${index})">Editar</button>
                <button class="btn-excluir" onclick="excluirMedicamento('${med.id}')">Excluir</button>
            </div>
        `;
        listaMedicamentos.appendChild(li);
    });
}

// Adicionar/Editar medicamento
formulario.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const nome = document.getElementById('nome').value;
    const quantidade = parseInt(document.getElementById('quantidade').value);
    const preco = parseFloat(document.getElementById('preco').value);
    const fornecedor = document.getElementById('fornecedor').value;
    const categoria = document.getElementById('categoria').value;
    
    if (!nome || !quantidade || !preco || !fornecedor || !categoria) {
        alert('Preencha todos os campos!');
        return;
    }
    
    const medicamento = {
        nome: nome,
        quantidade: quantidade,
        preco: preco,
        fornecedor: fornecedor,
        categoria: categoria,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        if (editandoId) {
            // Editar existente
            await db.collection('medicamentos').doc(editandoId).update(medicamento);
            console.log('Medicamento atualizado:', editandoId);
        } else {
            // Adicionar novo
            await db.collection('medicamentos').add(medicamento);
            console.log('Medicamento adicionado');
        }
        
        // Limpar e recarregar
        editandoId = null;
        editandoIndex = null;
        btnCancelar.style.display = 'none';
        formulario.reset();
        
        // Recarregar dados
        await carregarDados();
        
    } catch (error) {
        console.error('Erro ao salvar:', error);
        alert('Erro ao salvar medicamento: ' + error.message);
    }
});

// Editar medicamento
function editarMedicamento(id, index) {
    const med = dadosMedicamentos[index];
    document.getElementById('nome').value = med.nome;
    document.getElementById('quantidade').value = med.quantidade;
    document.getElementById('preco').value = med.preco;
    document.getElementById('fornecedor').value = med.fornecedor;
    document.getElementById('categoria').value = med.categoria;
    
    editandoId = id;
    editandoIndex = index;
    btnCancelar.style.display = 'inline-block';
    
    // Rolagem suave para o formulário
    formulario.scrollIntoView({ behavior: 'smooth' });
}

// Excluir medicamento
async function excluirMedicamento(id) {
    if (confirm('Tem certeza que deseja excluir este medicamento?')) {
        try {
            await db.collection('medicamentos').doc(id).delete();
            console.log('Medicamento excluído:', id);
            await carregarDados(); // Recarregar dados
        } catch (error) {
            console.error('Erro ao excluir:', error);
            alert('Erro ao excluir medicamento: ' + error.message);
        }
    }
}

// Cancelar edição
btnCancelar.addEventListener('click', function() {
    editandoId = null;
    editandoIndex = null;
    formulario.reset();
    btnCancelar.style.display = 'none';
});

// Pesquisar medicamentos
document.getElementById('campoPesquisa').addEventListener('input', function(e) {
    const termo = e.target.value.toLowerCase();
    const itens = document.querySelectorAll('.medicamento-item');
    
    itens.forEach(item => {
        const texto = item.textContent.toLowerCase();
        item.style.display = texto.includes(termo) ? 'flex' : 'none';
    });
});

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    console.log('Página carregada, inicializando Firebase...');
    carregarDados();
});
