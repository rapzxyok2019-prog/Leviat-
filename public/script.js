// Configuração do Firebase
const firebaseConfig = {
    apiKey: "sua-api-key-aqui",
    authDomain: "seu-projeto.firebaseapp.com",
    projectId: "seu-projeto-id",
    storageBucket: "seu-projeto.appspot.com",
    messagingSenderId: "seu-sender-id",
    appId: "sua-app-id"
};

// Inicializar Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let dadosMedicamentos = [];
let editandoIndex = null;

// Elementos DOM
const formulario = document.getElementById('medicamentoForm');
const listaMedicamentos = document.getElementById('listaMedicamentos');
const btnSalvar = document.getElementById('btnSalvar');
const btnCancelar = document.getElementById('btnCancelar');

// Carregar dados do Firestore
async function carregarDados() {
    try {
        console.log('Carregando dados do Firestore...');
        
        const snapshot = await db.collection('medicamentos').get();
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
        // Dados de exemplo se Firebase falhar
        dadosMedicamentos = [
            { id: '1', nome: "Paracetamol", quantidade: 100, preco: 5.50, fornecedor: "Farma Ltda", categoria: "Analgésico" },
            { id: '2', nome: "Dipirona", quantidade: 50, preco: 3.20, fornecedor: "Med Express", categoria: "Analgésico" }
        ];
        exibirMedicamentos();
    }
}

// Exibir medicamentos
function exibirMedicamentos() {
    if (!listaMedicamentos) return;
    
    listaMedicamentos.innerHTML = '';
    dadosMedicamentos.forEach((med, index) => {
        const li = document.createElement('li');
        li.className = 'medicamento-item';
        li.innerHTML = `
            <div class="med-info">
                <strong>${med.nome}</strong>
                <span>Qtd: ${med.quantidade}</span>
                <span>R$ ${med.preco.toFixed(2)}</span>
                <span>${med.fornecedor}</span>
                <span class="categoria">${med.categoria}</span>
            </div>
            <div class="med-actions">
                <button class="btn-editar" onclick="editarMedicamento(${index})">Editar</button>
                <button class="btn-excluir" onclick="excluirMedicamento(${index})">Excluir</button>
            </div>
        `;
        listaMedicamentos.appendChild(li);
    });
}

// Adicionar/Editar medicamento
formulario.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const medicamento = {
        nome: document.getElementById('nome').value,
        quantidade: parseInt(document.getElementById('quantidade').value),
        preco: parseFloat(document.getElementById('preco').value),
        fornecedor: document.getElementById('fornecedor').value,
        categoria: document.getElementById('categoria').value,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        if (editandoIndex !== null) {
            // Editar existente
            const medId = dadosMedicamentos[editandoIndex].id;
            await db.collection('medicamentos').doc(medId).update(medicamento);
            editandoIndex = null;
            btnCancelar.style.display = 'none';
        } else {
            // Adicionar novo
            await db.collection('medicamentos').add(medicamento);
        }
        
        await carregarDados(); // Recarregar dados atualizados
        formulario.reset();
        
    } catch (error) {
        console.error('Erro ao salvar:', error);
        alert('Erro ao salvar medicamento.');
    }
});

// Editar medicamento
function editarMedicamento(index) {
    const med = dadosMedicamentos[index];
    document.getElementById('nome').value = med.nome;
    document.getElementById('quantidade').value = med.quantidade;
    document.getElementById('preco').value = med.preco;
    document.getElementById('fornecedor').value = med.fornecedor;
    document.getElementById('categoria').value = med.categoria;
    editandoIndex = index;
    btnCancelar.style.display = 'inline-block';
    formulario.scrollIntoView({ behavior: 'smooth' });
}

// Excluir medicamento
async function excluirMedicamento(index) {
    if (confirm('Tem certeza que deseja excluir este medicamento?')) {
        try {
            const medId = dadosMedicamentos[index].id;
            await db.collection('medicamentos').doc(medId).delete();
            await carregarDados(); // Recarregar dados atualizados
        } catch (error) {
            console.error('Erro ao excluir:', error);
            alert('Erro ao excluir medicamento.');
        }
    }
}

// Cancelar edição
btnCancelar.addEventListener('click', function() {
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

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    // Remove mensagem de carregamento se existir
    document.body.innerHTML = document.body.innerHTML.replace('Carregando Dados da Nuvem e Painel...', '');
    carregarDados();
});
