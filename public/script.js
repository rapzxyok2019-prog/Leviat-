// Configurações
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/gviz/tq?tqx=out:json';
let dadosPlanilha = [];
let editandoIndex = null;

// Elementos DOM
const formulario = document.getElementById('medicamentoForm');
const listaMedicamentos = document.getElementById('listaMedicamentos');
const btnSalvar = document.getElementById('btnSalvar');
const btnCancelar = document.getElementById('btnCancelar');

// Carregar dados da planilha
async function carregarPlanilha() {
    try {
        console.log('Carregando planilha...');
        
        // Remove a mensagem de carregamento
        document.body.innerHTML = document.body.innerHTML.replace('Carregando Dados da Nuvem e Painel...', '');
        
        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error('Erro ao carregar planilha');
        
        const data = await response.text();
        const jsonStr = data.substring(47).slice(0, -2);
        const json = JSON.parse(jsonStr);
        const rows = json.table.rows;
        
        dadosPlanilha = rows.map((row, index) => {
            const cells = row.c;
            return {
                id: index,
                nome: cells[0] ? (cells[0].v || '') : '',
                quantidade: cells[1] ? (cells[1].v || 0) : 0,
                preco: cells[2] ? (cells[2].v || 0) : 0,
                fornecedor: cells[3] ? (cells[3].v || '') : '',
                categoria: cells[4] ? (cells[4].v || '') : ''
            };
        }).filter(item => item.nome !== '');
        
        exibirMedicamentos();
        
    } catch (error) {
        console.error('Erro:', error);
        // Remove mensagem de carregamento
        document.body.innerHTML = document.body.innerHTML.replace('Carregando Dados da Nuvem e Painel...', '');
        // Dados de exemplo
        dadosPlanilha = [
            { id: 1, nome: "Paracetamol", quantidade: 100, preco: 5.50, fornecedor: "Farma Ltda", categoria: "Analgésico" },
            { id: 2, nome: "Dipirona", quantidade: 50, preco: 3.20, fornecedor: "Med Express", categoria: "Analgésico" }
        ];
        exibirMedicamentos();
    }
}

// Exibir medicamentos
function exibirMedicamentos() {
    if (!listaMedicamentos) return;
    
    listaMedicamentos.innerHTML = '';
    dadosPlanilha.forEach((med, index) => {
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

// Resto do código permanece igual...
formulario.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const medicamento = {
        nome: document.getElementById('nome').value,
        quantidade: parseInt(document.getElementById('quantidade').value),
        preco: parseFloat(document.getElementById('preco').value),
        fornecedor: document.getElementById('fornecedor').value,
        categoria: document.getElementById('categoria').value
    };
    
    if (editandoIndex !== null) {
        dadosPlanilha[editandoIndex] = { ...medicamento, id: dadosPlanilha[editandoIndex].id };
        editandoIndex = null;
        btnCancelar.style.display = 'none';
    } else {
        medicamento.id = Date.now();
        dadosPlanilha.push(medicamento);
    }
    
    exibirMedicamentos();
    formulario.reset();
});

function editarMedicamento(index) {
    const med = dadosPlanilha[index];
    document.getElementById('nome').value = med.nome;
    document.getElementById('quantidade').value = med.quantidade;
    document.getElementById('preco').value = med.preco;
    document.getElementById('fornecedor').value = med.fornecedor;
    document.getElementById('categoria').value = med.categoria;
    editandoIndex = index;
    btnCancelar.style.display = 'inline-block';
    formulario.scrollIntoView({ behavior: 'smooth' });
}

function excluirMedicamento(index) {
    if (confirm('Tem certeza que deseja excluir este medicamento?')) {
        dadosPlanilha.splice(index, 1);
        exibirMedicamentos();
    }
}

btnCancelar.addEventListener('click', function() {
    editandoIndex = null;
    formulario.reset();
    btnCancelar.style.display = 'none';
});

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
    carregarPlanilha();
});
