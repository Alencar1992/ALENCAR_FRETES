// ==========================================
// CONFIGURAÇÕES GLOBAIS - ALENCAR FRETES
// ==========================================
const LOCATIONIQ_TOKEN = 'pk.1a31ca6507dd252aa191052a40573422';
const GOOGLE_SCRIPT_URL_PEDIDOS = "https://script.google.com/macros/s/AKfycbwvhHL4BiAecxAgumFmeFqmNhL62C87PSJ0zX1nIZTkB2tIDEz26y6SFbovQnh3B2oEHQ/exec"; 
const GOOGLE_SCRIPT_URL_LOG = "https://script.google.com/macros/s/AKfycbyRQRB6p7ORaWgEro0KhS7rQ784g206cj0HiktkUjcn2TludQ4MHvqbRo163KHPpKYOIA/exec"; 
const TAXA_MINIMA = 10.00; // ATUALIZADO: Valor mínimo cobrado
const VALOR_POR_KM = 2.00; // ATUALIZADO: Valor cobrado por KM
const ORIGEM_FIXA = L.latLng(-23.64464679519379, -46.72038817129933);
const WHATSAPP_NUMERO = "5511981071822";

let tipoResidencia = ""; 
let tipoBusca = ""; 
let rotaCalculada = false;
let bairroGlobal = "";
let tempoGlobal = "";
let timeoutBusca = null;

// ==========================================
// INICIALIZAÇÃO DO MAPA (LEAFLET)
// ==========================================
const map = L.map('map', { zoomControl: false }).setView(ORIGEM_FIXA, 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

const iconeMoto = L.divIcon({ html: '🏍️', className: 'icone-mapa-moto', iconSize: [35, 35], iconAnchor: [17, 17] });
const iconeCasa = L.divIcon({ html: '🏠', className: 'icone-mapa-casa', iconSize: [35, 35], iconAnchor: [17, 17] });

let control = L.Routing.control({
    waypoints: [], 
    lineOptions: { styles: [{ color: '#2ecc71', weight: 6, opacity: 0.9 }] }, 
    createMarker: function(i, wp, n) {
        if (i === 0) return L.marker(wp.latLng, { icon: iconeMoto }).bindPopup("<b>Origem:</b><br>Alencar Fretes");
        if (i === n - 1) return L.marker(wp.latLng, { icon: iconeCasa }).bindPopup("<b>Destino:</b><br>Cliente");
        return null;
    },
    addWaypoints: false,
    routeWhileDragging: false,
    show: false
}).addTo(map);

// ==========================================
// CONTROLES DE INTERFACE
// ==========================================
function selecionarTipo(tipo) {
    tipoResidencia = tipo;
    document.getElementById('btn-casa').className = tipo === 'casa' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('btn-apto').className = tipo === 'apto' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('dados-apto').style.display = tipo === 'apto' ? 'block' : 'none';
}

function selecionarBusca(tipo) {
    tipoBusca = tipo;
    document.getElementById('btn-por-cep').className = tipo === 'cep' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('btn-por-rua').className = tipo === 'rua' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('campo-cep').style.display = tipo === 'cep' ? 'block' : 'none';
    document.getElementById('campo-rua').style.display = tipo === 'rua' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    if (e.target.id !== 'destino') {
        const lista = document.getElementById('lista-sugestoes');
        if(lista) lista.style.display = 'none';
    }
});

// ==========================================
// BUSCAS DE ENDEREÇO
// ==========================================
async function sugerirEndereco(texto) {
    const lista = document.getElementById('lista-sugestoes');
    if (texto.length < 4) { lista.style.display = 'none'; return; }
    
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(async () => {
        try {
            const url = `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_TOKEN}&q=${encodeURIComponent(texto + ' São Paulo')}&countrycodes=br&limit=5`;
            const resp = await fetch(url);
            const data = await resp.json();
            
            lista.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'sugestao-item';
                    div.innerText = item.display_name;
                    div.onclick = () => {
                        const partes = item.display_name.split(',');
                        document.getElementById('destino').value = partes[0].trim();
                        lista.style.display = 'none';
                    };
                    lista.appendChild(div);
                });
                lista.style.display = 'block';
            } else {
                lista.style.display = 'none';
            }
        } catch (e) { console.warn("Autocompletar falhou", e); }
    }, 600);
}

async function buscarCep() {
    const cep = document.getElementById('cep').value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    
    const inputRua = document.getElementById('rua_pelo_cep');
    inputRua.value = "Buscando...";

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        
        if (!data.erro) {
            inputRua.value = data.logradouro;
            bairroGlobal = data.bairro; 
        } else { 
            inputRua.value = "";
            alert("CEP não encontrado."); 
        }
    } catch (e) { 
        inputRua.value = "";
        console.warn("Erro no ViaCEP"); 
    }
}

// ==========================================
// FUNÇÕES DE TRAVAMENTO E LIBERAÇÃO DO BOTÃO
// ==========================================
function liberarBotao(mensagem = "🚀 CALCULAR O FRETE") {
    const btn = document.getElementById('btn-calcular');
    btn.innerHTML = mensagem;
    btn.disabled = false;
}

// ==========================================
// VERIFICAÇÃO DE ACESSO E LOG (Apps Script)
// ==========================================
async function iniciarVerificacao() {
    const btn = document.getElementById('btn-calcular');
    btn.innerHTML = "⏳ VERIFICANDO...";
    btn.disabled = true;

    let ipUsuario = "0.0.0.0";
    try {
        const controle = new AbortController();
        const idTempo = setTimeout(() => controle.abort(), 3000);
        let resIp = await fetch("https://api.ipify.org?format=json", { signal: controle.signal });
        clearTimeout(idTempo);
        if (resIp.ok) { let jsonIp = await resIp.json(); ipUsuario = jsonIp.ip; }
    } catch(e) { }

    try {
        let pacote = JSON.stringify({ tipo: "verificar_limite", ip: ipUsuario });
        // CORREÇÃO: Adicionado redirect follow e o header correto para não dar erro de CORS no Google
        let respostaGas = await fetch(GOOGLE_SCRIPT_URL_LOG, { 
            redirect: "follow",
            method: "POST", 
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: pacote 
        });
        
        let resultadoTexto = await respostaGas.text();
        let resultado = JSON.parse(resultadoTexto);

        if (resultado.status === "bloqueado") {
            document.getElementById('modalLimiteSemanal').style.display = 'flex';
            liberarBotao();
            return; // Bloqueia e para a função aqui
        }
    } catch (e) {
        console.warn("Aviso: Falha na planilha, prosseguindo com o cálculo.");
    }

    // Se chegou até aqui, está liberado para validar os dados
    validarExpediente();
}

// ==========================================
// VALIDAÇÃO DOS DADOS DO CLIENTE
// ==========================================
function validarExpediente() {
    if (!tipoBusca) {
        liberarBotao();
        return alert("Selecione 'Por CEP' ou 'Nome da Rua' primeiro.");
    }
    
    const dataVal = document.getElementById('data_entrega').value;
    const horaVal = document.getElementById('hora_entrega').value;
    
    if(!dataVal || !horaVal) {
        liberarBotao();
        return alert("Por favor, preencha a Data e o Horário da entrega!");
    }
    
    if (tipoBusca === 'cep' && (!document.getElementById('cep').value || !document.getElementById('num_residencia_cep').value)) {
        liberarBotao();
        return alert("Preencha o CEP e o Número da residência!");
    } else if (tipoBusca === 'rua' && (!document.getElementById('destino').value || !document.getElementById('num_residencia').value)) {
        liberarBotao();
        return alert("Preencha a Rua e o Número da residência!");
    }

    const d = new Date(dataVal + 'T' + horaVal);
    // Validação de horário comercial (Segunda a Sexta, 08h as 17h)
    if(d.getDay() >= 1 && d.getDay() <= 5 && d.getHours() >= 8 && d.getHours() <= 17) {
        document.getElementById('modalExpediente').style.display = 'flex';
    } else { 
        buscarRota(); 
    }
}

function continuarCalculo() {
    document.getElementById('modalExpediente').style.display = 'none';
    buscarRota();
}

// ==========================================
// MAPA E CÁLCULO DE ROTA (A CORREÇÃO PRINCIPAL)
// ==========================================
async function buscarRota() {
    const btn = document.getElementById('btn-calcular');
    btn.innerHTML = "⏳ CALCULANDO...";
    btn.disabled = true;

    let queryBusca = tipoBusca === 'cep' 
        ? `${document.getElementById('rua_pelo_cep').value} ${document.getElementById('num_residencia_cep').value} São Paulo`
        : `${document.getElementById('destino').value} ${document.getElementById('num_residencia').value} São Paulo`;
    
    try {
        const resp = await fetch(`https://us1.locationiq.com/v1/search.php?key=${LOCATIONIQ_TOKEN}&q=${encodeURIComponent(queryBusca)}&format=json&addressdetails=1`);
        const data = await resp.json();
        
        if(data && data.length > 0) {
            const info = data[0];
            if (tipoBusca === 'rua' && info.address) {
                bairroGlobal = info.address.suburb || info.address.neighbourhood || info.address.city_district || "SÃO PAULO";
            }
            
            document.getElementById('res-bairro').innerText = bairroGlobal.toUpperCase();
            document.getElementById('campo-resumo').style.display = 'block';
            document.getElementById('sec-tipo-local').style.display = 'block';
            
            // BUG RESOLVIDO: O mapa precisa de um tempinho (200ms) para perceber que o container "campo-resumo" apareceu na tela antes de renderizar a rota.
            setTimeout(() => {
                map.invalidateSize();
                control.setWaypoints([ORIGEM_FIXA, L.latLng(info.lat, info.lon)]);
            }, 200);

        } else { 
            alert("Endereço não localizado com precisão."); 
            liberarBotao();
        }
    } catch (e) { 
        alert("Erro de conexão ao buscar rota no mapa."); 
        liberarBotao();
    } 
}

// Quando o Leaflet terminar de traçar a rota com sucesso
control.on('routesfound', function(e) {
    const routes = e.routes[0];
    const km = routes.summary.totalDistance / 1000;
    
    const tempoMin = Math.round(routes.summary.totalTime / 60) + 5;
    tempoGlobal = tempoMin + " MIN";
    
    // CÁLCULO ATUALIZADO: R$ 2,00 por KM e R$ 10,00 de mínima
    const calculoBase = km * VALOR_POR_KM;
    const valorFinal = Math.max(TAXA_MINIMA, calculoBase);
    const valorFormatado = valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    document.getElementById('distancia').innerText = km.toFixed(2);
    document.getElementById('res-tempo').innerText = tempoGlobal;
    document.getElementById('valor').innerText = valorFormatado;
    
    document.getElementById('aviso-taxa').style.display = (calculoBase < TAXA_MINIMA ? 'block' : 'none');
    
    let enderecoBuscado = tipoBusca === 'cep' 
        ? `${document.getElementById('rua_pelo_cep').value}, ${document.getElementById('num_residencia_cep').value} (CEP: ${document.getElementById('cep').value})`
        : `${document.getElementById('destino').value}, ${document.getElementById('num_residencia').value}`;
    
    registrarLogJS(km.toFixed(2), valorFormatado, enderecoBuscado, bairroGlobal.toUpperCase());

    setTimeout(() => { document.getElementById('campo-resumo').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    setTimeout(() => { map.fitBounds(L.latLngBounds(routes.coordinates), {padding: [40, 40]}); }, 300);

    rotaCalculada = true;
    liberarBotao("🔄 RECALCULAR FRETE"); // Sucesso total, libera o botão
});

// Se o servidor de rotas do mapa cair
control.on('routingerror', function(e) {
    alert("Erro ao traçar a rota. Tente detalhar melhor o endereço ou o número.");
    liberarBotao();
});


// ==========================================
// FUNÇÕES AUXILIARES E FINALIZAÇÃO
// ==========================================
function limpar() { location.reload(); }
function fecharModalExpediente() { document.getElementById('modalExpediente').style.display = 'none'; liberarBotao(); }
function fecharModal() { document.getElementById('avisoLucas').style.display = 'none'; }

function prepararEnvio() {
    if (!tipoResidencia) return alert("Selecione se a entrega é em CASA ou APTO.");
    if (!document.getElementById('nome_cliente').value) return alert("Preencha o Nome do Cliente!");
    document.getElementById('avisoLucas').style.display = 'flex';
}

function obterDataFormatada(dataInput) {
    if(!dataInput) return "---";
    const partes = dataInput.split('-');
    const d = new Date(partes[0], parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
    const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
    const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
    return `${diasSemana[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function finalizarEnvio() {
    const bloco = document.getElementById('bloco').value;
    const apto = document.getElementById('apto').value;
    
    let destFinal = tipoBusca === 'cep' ? 
        `${document.getElementById('rua_pelo_cep').value}, ${document.getElementById('num_residencia_cep').value} (CEP: ${document.getElementById('cep').value})` :
        `${document.getElementById('destino').value}, ${document.getElementById('num_residencia').value}`;

    const dados = {
        data: obterDataFormatada(document.getElementById('data_entrega').value),
        hora: document.getElementById('hora_entrega').value,
        nome: document.getElementById('nome_cliente').value,
        destino: destFinal,
        bairro: bairroGlobal.toUpperCase(),
        ref: document.getElementById('ponto_referencia').value || "NÃO INFORMADO",
        km: document.getElementById('distancia').innerText,
        valor: document.getElementById('valor').innerText,
        tipo: tipoResidencia.toUpperCase(),
        bloco: bloco || "---",
        apto: apto || "---"
    };

    let msg = `*NOVO PEDIDO - ALENCAR FRETES*%0A%0A`;
    msg += `📅 *DATA:* ${dados.data}%0A⏰ *HORA:* ${dados.hora}%0A👤 *CLIENTE:* ${dados.nome}%0A🏘️ *BAIRRO:* ${dados.bairro}%0A⏱️ *TEMPO ESTIMADO:* ${tempoGlobal}%0A🏁 *DESTINO:* ${dados.destino}%0A`;
    
    if(tipoResidencia === 'apto') msg += `🏢 *LOCAL:* Bloco ${dados.bloco} - Apto ${dados.apto}%0A`;
    msg += `📍 *REF:* ${dados.ref}%0A📏 *DISTÂNCIA:* ${dados.km} km%0A💰 *VALOR:* ${dados.valor}`;

    fetch(GOOGLE_SCRIPT_URL_PEDIDOS, { method: 'POST', mode: 'no-cors', body: JSON.stringify(dados) });
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${msg}`, '_blank');
    fecharModal();
}

// Bloqueio de datas customizadas
document.addEventListener("DOMContentLoaded", function() {
    const inputData = document.getElementById('data_entrega');
    if (inputData) {
        inputData.addEventListener('change', function() {
            if (this.value === '2026-03-07') {
                alert("⚠️ Data Indisponível, Eu tenho Compromissos o Dia todo!");
                this.value = ''; 
            }
        });
    }
});

// ==========================================
// ESPIÃO DE DADOS (PLANILHA)
// ==========================================
async function registrarLogJS(km, valor, endereco, bairro) {
    let ipUsuario = "0.0.0.0";
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        let resIp = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (resIp.ok) { let jsonIp = await resIp.json(); ipUsuario = jsonIp.ip; }
    } catch(e) {}

    let textoDispositivo = navigator.userAgent;
    let dispFormatado = "📱 Outro/Desconhecido";
    if (/android/i.test(textoDispositivo)) dispFormatado = "📱 Celular Android";
    else if (/iPad|iPhone|iPod/.test(textoDispositivo)) dispFormatado = "🍎 iPhone / iPad";
    else if (/windows/i.test(textoDispositivo)) dispFormatado = "💻 Computador Windows";
    else if (/mac/i.test(textoDispositivo)) dispFormatado = "💻 Computador Mac";

    let pacoteDeDados = { data: new Date().toLocaleString("pt-BR"), ip: ipUsuario, dispositivo: dispFormatado, endereco: endereco, bairro: bairro, km: km, valor: valor };
    fetch(GOOGLE_SCRIPT_URL_LOG, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pacoteDeDados) });
}
