// ==========================================
// CONFIGURAÇÕES GLOBAIS - ALENCAR FRETES
// ==========================================
const LOCATIONIQ_TOKEN = 'pk.1a31ca6507dd252aa191052a40573422';
const GOOGLE_SCRIPT_URL_PEDIDOS = "https://script.google.com/macros/s/AKfycbwvhHL4BiAecxAgumFmeFqmNhL62C87PSJ0zX1nIZTkB2tIDEz26y6SFbovQnh3B2oEHQ/exec"; 
const GOOGLE_SCRIPT_URL_LOG = "https://script.google.com/macros/s/AKfycbyRQRB6p7ORaWgEro0KhS7rQ784g206cj0HiktkUjcn2TludQ4MHvqbRo163KHPpKYOIA/exec"; 
const TAXA_MINIMA = 10.00; // Valor Mínimo Absoluto
const VALOR_POR_KM = 2.00; // Valor cobrado por KM rodado
const ORIGEM_FIXA = L.latLng(-23.64464679519379, -46.72038817129933);
const WHATSAPP_NUMERO = "5511981071822";

let tipoResidencia = ""; 
let tipoBusca = ""; 
let rotaCalculada = false;
let bairroGlobal = "";
let tempoGlobal = "";
let timeoutBusca = null;

// ==========================================
// FUNÇÃO DE AVISOS SEGUROS
// ==========================================
function mostrarAviso(mensagem) {
    const modal = document.getElementById('modalAviso');
    const texto = document.getElementById('textoAviso');
    
    // Se o modal existir no HTML, ele exibe bonito. Se não, usa o alert padrão para não travar o app.
    if (modal && texto) {
        texto.innerText = mensagem;
        modal.style.display = 'flex';
    } else {
        alert(mensagem);
    }
}

// ==========================================
// INICIALIZAÇÃO DO MAPA (LEAFLET)
// ==========================================
const map = L.map('map', { zoomControl: false }).setView(ORIGEM_FIXA, 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

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
// CONTROLES DE INTERFACE E EVENTOS
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
// AUTOCOMPLETE E BUSCA CEP
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
            mostrarAviso("CEP não encontrado."); 
        }
    } catch (e) { 
        inputRua.value = "";
        console.warn("Erro no ViaCEP"); 
    }
}

// ==========================================
// VALIDAÇÃO E GATILHO INICIAL (Sem Travamento)
// ==========================================
function liberarBotao(mensagem = "🚀 CALCULAR O FRETE") {
    const btn = document.getElementById('btn-calcular');
    btn.innerHTML = mensagem;
    btn.disabled = false;
}

function validacoesIniciais() {
    if (!tipoBusca) { mostrarAviso("Selecione 'Por CEP' ou 'Nome da Rua' primeiro."); return false; }
    
    const dataVal = document.getElementById('data_entrega').value;
    const horaVal = document.getElementById('hora_entrega').value;
    
    if(!dataVal || !horaVal) { mostrarAviso("Por favor, preencha a Data e o Horário da entrega!"); return false; }
    
    if (tipoBusca === 'cep' && (!document.getElementById('cep').value || !document.getElementById('num_residencia_cep').value)) {
        mostrarAviso("Preencha o CEP e o Número da residência!"); return false;
    } else if (tipoBusca === 'rua' && (!document.getElementById('destino').value || !document.getElementById('num_residencia').value)) {
        mostrarAviso("Preencha a Rua e o Número da residência!"); return false;
    }
    return true; 
}

async function iniciarVerificacao() {
    const btn = document.getElementById('btn-calcular');
    btn.innerHTML = "⏳ VERIFICANDO...";
    btn.disabled = true;

    if (!validacoesIniciais()) {
        liberarBotao();
        return;
    }

    try {
        // Tenta checar o limite no Google Script muito rapidamente (Timeout de 1,5 segundos)
        // Se a planilha estiver com erro ou demorar, ele aborta e DEIXA o cliente calcular.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); 
        
        const pacote = JSON.stringify({ tipo: "verificar_limite", ip: "0.0.0.0" });
        const respostaGas = await fetch(GOOGLE_SCRIPT_URL_LOG, { 
            method: "POST", 
            body: pacote,
            signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        const resultadoTexto = await respostaGas.text();
        
        if (resultadoTexto.includes('"bloqueado"')) {
            const modalLimite = document.getElementById('modalLimiteSemanal');
            if(modalLimite) modalLimite.style.display = 'flex';
            else mostrarAviso("Limite de consultas atingido. Fale comigo no WhatsApp.");
            
            liberarBotao();
            return; 
        }
    } catch (e) {
        console.warn("Verificação ignorada por demora ou erro. Seguindo para o cálculo.");
    }

    // Segue para verificar se está dentro do horário comercial para mostrar o aviso de disponibilidade
    validarExpediente();
}

function validarExpediente() {
    const dataVal = document.getElementById('data_entrega').value;
    const horaVal = document.getElementById('hora_entrega').value;
    const d = new Date(dataVal + 'T' + horaVal);
    
    // Se for entre Segunda(1) e Sexta(5), das 08:00 as 17:00, avisa sobre a disponibilidade.
    if(d.getDay() >= 1 && d.getDay() <= 5 && d.getHours() >= 8 && d.getHours() <= 17) {
        const modal = document.getElementById('modalExpediente');
        if(modal) modal.style.display = 'flex';
        else buscarRota(); // Se não achar o modal, calcula direto
    } else { 
        buscarRota(); 
    }
}

function continuarCalculo() {
    document.getElementById('modalExpediente').style.display = 'none';
    buscarRota();
}

// ==========================================
// CÁLCULO DE ROTA (O MOTOR)
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
            
            setTimeout(() => {
                map.invalidateSize();
                control.setWaypoints([ORIGEM_FIXA, L.latLng(info.lat, info.lon)]);
            }, 200);

        } else { 
            mostrarAviso("Endereço não localizado com precisão. Verifique a escrita e tente novamente."); 
            liberarBotao();
        }
    } catch (e) { 
        mostrarAviso("Erro de conexão ao buscar rota no mapa."); 
        liberarBotao();
    } 
}

// Quando o mapa encontra a rota com sucesso, ele faz as contas financeiras.
control.on('routesfound', function(e) {
    const routes = e.routes[0];
    const km = routes.summary.totalDistance / 1000;
    
    const tempoMin = Math.round(routes.summary.totalTime / 60) + 5;
    tempoGlobal = tempoMin + " MIN";
    
    // A MATEMÁTICA: Pega a quilometragem e multiplica por 2 reais. 
    // O comando Math.max obriga o valorFinal a nunca ser menor que os 10 reais da TAXA_MINIMA.
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
    
    // Registra silenciosamente na planilha de controle
    registrarLogJS(km.toFixed(2), valorFormatado, enderecoBuscado, bairroGlobal.toUpperCase());

    setTimeout(() => { document.getElementById('campo-resumo').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    setTimeout(() => { map.fitBounds(L.latLngBounds(routes.coordinates), {padding: [40, 40]}); }, 300);

    rotaCalculada = true;
    liberarBotao("🔄 RECALCULAR FRETE"); 
});

control.on('routingerror', function(e) {
    mostrarAviso("Erro ao traçar a rota. Tente detalhar melhor o endereço ou o número.");
    liberarBotao();
});

// ==========================================
// FUNÇÕES DE ENVIO E FORMATAÇÃO DE DADOS
// ==========================================
function limpar() { location.reload(); }
function fecharModalExpediente() { document.getElementById('modalExpediente').style.display = 'none'; liberarBotao(); }
function fecharModal() { document.getElementById('avisoLucas').style.display = 'none'; }

function prepararEnvio() {
    if (!tipoResidencia) return mostrarAviso("Selecione se a entrega é em CASA ou APTO.");
    if (!document.getElementById('nome_cliente').value) return mostrarAviso("Preencha o Nome do Cliente!");
    
    const modal = document.getElementById('avisoLucas');
    if(modal) modal.style.display = 'flex';
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
                mostrarAviso("⚠️ Data Indisponível, Eu tenho Compromissos o Dia todo!");
                this.value = ''; 
            }
        });
    }
});

// ==========================================
// REGISTRO DE DADOS ASSÍNCRONO NO GOOGLE SHEETS
// ==========================================
async function registrarLogJS(km, valor, endereco, bairro) {
    let textoDispositivo = navigator.userAgent;
    let dispFormatado = "📱 Outro/Desconhecido";
    if (/android/i.test(textoDispositivo)) dispFormatado = "📱 Celular Android";
    else if (/iPad|iPhone|iPod/.test(textoDispositivo)) dispFormatado = "🍎 iPhone / iPad";
    else if (/windows/i.test(textoDispositivo)) dispFormatado = "💻 Computador Windows";
    else if (/mac/i.test(textoDispositivo)) dispFormatado = "💻 Computador Mac";

    let pacoteDeDados = { 
        data: new Date().toLocaleString("pt-BR"), 
        ip: "0.0.0.0", 
        dispositivo: dispFormatado, 
        endereco: endereco, 
        bairro: bairro, 
        km: km, 
        valor: valor 
    };
    
    fetch(GOOGLE_SCRIPT_URL_LOG, { 
        method: "POST", 
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(pacoteDeDados) 
    });
}
