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
let timeoutBuscaP2 = null; // Variável para o delay do autocomplete da parada 2

// Nova variável global: Controla se a rota atual possui uma parada extra
let temParada2 = false; 

// Variável global para armazenar o IP temporariamente e não sobrecarregar a API
let ipGlobalCache = null;

// ==========================================
// FUNÇÃO DE CAPTURA DE IP REUTILIZÁVEL
// ==========================================
/**
 * Captura o IP do usuário consumindo a API ipify.
 */
async function obterIpUsuario() {
    if (ipGlobalCache) return ipGlobalCache;
    try {
        const respostaIp = await fetch('https://api.ipify.org?format=json');
        const dadosIp = await respostaIp.json();
        ipGlobalCache = dadosIp.ip;
        return ipGlobalCache;
    } catch (erro) {
        console.error("⚠️ Falha ao capturar o IP:", erro);
        return "IP_DESCONHECIDO";
    }
}

// ==========================================
// FUNÇÃO DE AVISOS SEGUROS
// ==========================================
/**
 * Exibe mensagens de erro em um modal amigável na tela.
 */
function mostrarAviso(mensagem) {
    const modal = document.getElementById('modalAviso');
    const texto = document.getElementById('textoAviso');
    
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
// Inicia o mapa na div 'map' centralizado na base
const map = L.map('map', { zoomControl: false }).setView(ORIGEM_FIXA, 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

// Ícones personalizados
const iconeMoto = L.divIcon({ html: '🏍️', className: 'icone-mapa-moto', iconSize: [35, 35], iconAnchor: [17, 17] });
const iconeCasa = L.divIcon({ html: '🏠', className: 'icone-mapa-casa', iconSize: [35, 35], iconAnchor: [17, 17] });
const iconeParada = L.divIcon({ html: '🛑', className: 'icone-mapa-parada', iconSize: [35, 35], iconAnchor: [17, 17] });

// Controlador de rotas. Atualizado para entender rotas com 3 pontos (Origem -> Parada 1 -> Destino)
let control = L.Routing.control({
    waypoints: [], 
    lineOptions: { styles: [{ color: '#2ecc71', weight: 6, opacity: 0.9 }] }, 
    createMarker: function(i, wp, n) {
        if (i === 0) return L.marker(wp.latLng, { icon: iconeMoto }).bindPopup("<b>Origem:</b><br>Alencar Fretes");
        // Se for o último ponto (seja Parada 1 ou Parada 2), é o destino final
        if (i === n - 1) return L.marker(wp.latLng, { icon: iconeCasa }).bindPopup("<b>Destino Final:</b><br>Cliente");
        // Se houver 3 pontos e for o ponto do meio (índice 1)
        if (n === 3 && i === 1) return L.marker(wp.latLng, { icon: iconeParada }).bindPopup("<b>1ª Parada</b>");
        return null;
    },
    addWaypoints: false,
    routeWhileDragging: false,
    show: false
}).addTo(map);

// ==========================================
// CONTROLES DE INTERFACE E EVENTOS
// ==========================================
/**
 * Alterna as seleções visuais dos botões de Casa ou Apartamento.
 */
function selecionarTipo(tipo) {
    tipoResidencia = tipo;
    document.getElementById('btn-casa').className = tipo === 'casa' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('btn-apto').className = tipo === 'apto' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('dados-apto').style.display = tipo === 'apto' ? 'block' : 'none';
}

/**
 * Alterna a visualização entre busca por CEP ou Rua para o destino Principal.
 */
function selecionarBusca(tipo) {
    tipoBusca = tipo;
    document.getElementById('btn-por-cep').className = tipo === 'cep' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('btn-por-rua').className = tipo === 'rua' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('campo-cep').style.display = tipo === 'cep' ? 'block' : 'none';
    document.getElementById('campo-rua').style.display = tipo === 'rua' ? 'block' : 'none';
}

/**
 * Exibe o bloco da 2ª parada.
 */
function mostrarParada2() {
    document.getElementById('bloco-parada2').style.display = 'block';
    document.getElementById('btn-mostrar-parada2').style.display = 'none';
    temParada2 = true;
    selecionarBuscaP2('rua'); // Padrão
}

/**
 * Esconde e limpa o bloco da 2ª parada.
 */
function ocultarParada2() {
    document.getElementById('bloco-parada2').style.display = 'none';
    document.getElementById('btn-mostrar-parada2').style.display = 'block';
    temParada2 = false;
    document.getElementById('cep_parada2').value = '';
    document.getElementById('num_residencia_cep_p2').value = '';
    document.getElementById('rua_pelo_cep_p2').value = '';
    document.getElementById('destino_parada2').value = '';
    document.getElementById('num_residencia_p2').value = '';
}

/**
 * Alterna a visualização entre busca por CEP ou Rua para a 2ª Parada.
 */
function selecionarBuscaP2(tipo) {
    document.getElementById('btn-por-cep-p2').className = tipo === 'cep' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('btn-por-rua-p2').className = tipo === 'rua' ? 'btn-selecao active' : 'btn-selecao';
    document.getElementById('campo-cep-p2').style.display = tipo === 'cep' ? 'block' : 'none';
    document.getElementById('campo-rua-p2').style.display = tipo === 'rua' ? 'block' : 'none';
}

// Oculta a lista de sugestões ao clicar fora
document.addEventListener('click', function(e) {
    if (e.target.id !== 'destino') {
        const lista = document.getElementById('lista-sugestoes');
        if(lista) lista.style.display = 'none';
    }
    if (e.target.id !== 'destino_parada2') {
        const lista2 = document.getElementById('lista-sugestoes-p2');
        if(lista2) lista2.style.display = 'none';
    }
});

// ==========================================
// AUTOCOMPLETE E BUSCA CEP
// ==========================================
/**
 * Busca sugestões de endereço via API (Destino Principal).
 */
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

/**
 * Busca sugestões de endereço via API (2ª Parada).
 */
async function sugerirEnderecoP2(texto) {
    const lista = document.getElementById('lista-sugestoes-p2');
    if (texto.length < 4) { lista.style.display = 'none'; return; }
    
    clearTimeout(timeoutBuscaP2);
    timeoutBuscaP2 = setTimeout(async () => {
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
                        document.getElementById('destino_parada2').value = partes[0].trim();
                        lista.style.display = 'none';
                    };
                    lista.appendChild(div);
                });
                lista.style.display = 'block';
            } else {
                lista.style.display = 'none';
            }
        } catch (e) { console.warn("Autocompletar P2 falhou", e); }
    }, 600);
}

/**
 * Busca rua pelo CEP via API ViaCEP (Destino Principal).
 */
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
    } catch (e) { inputRua.value = ""; console.warn("Erro no ViaCEP"); }
}

/**
 * Busca rua pelo CEP via API ViaCEP (2ª Parada).
 */
async function buscarCepP2() {
    const cep = document.getElementById('cep_parada2').value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    const inputRua = document.getElementById('rua_pelo_cep_p2');
    inputRua.value = "Buscando...";

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        if (!data.erro) {
            inputRua.value = data.logradouro;
        } else { 
            inputRua.value = "";
            mostrarAviso("CEP da 2ª Parada não encontrado."); 
        }
    } catch (e) { inputRua.value = ""; console.warn("Erro no ViaCEP P2"); }
}

// ==========================================
// VALIDAÇÃO E GATILHO INICIAL
// ==========================================
function liberarBotao(mensagem = "🚀 CALCULAR O FRETE") {
    const btn = document.getElementById('btn-calcular');
    btn.innerHTML = mensagem;
    btn.disabled = false;
}

/**
 * Valida se os campos de texto foram preenchidos antes de consumir as APIs.
 */
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

    // Validação extra caso a 2ª Parada esteja ativa
    if (temParada2) {
        let tipoBuscaP2 = document.getElementById('campo-cep-p2').style.display === 'block' ? 'cep' : 'rua';
        if (tipoBuscaP2 === 'cep' && (!document.getElementById('cep_parada2').value || !document.getElementById('num_residencia_cep_p2').value)) {
            mostrarAviso("Preencha o CEP e o Número da 2ª Parada!"); return false;
        } else if (tipoBuscaP2 === 'rua' && (!document.getElementById('destino_parada2').value || !document.getElementById('num_residencia_p2').value)) {
            mostrarAviso("Preencha a Rua e o Número da 2ª Parada!"); return false;
        }
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
        const ipReal = await obterIpUsuario();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); 
        
        const pacote = JSON.stringify({ tipo: "verificar_limite", ip: ipReal });
        const respostaGas = await fetch(GOOGLE_SCRIPT_URL_LOG, { 
            method: "POST", 
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: pacote,
            signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        const resposta = await respostaGas.json();
        
        if (resposta.result === "bloqueado") {
            mostrarAviso("Excedeu o limite de acesso semanal. Contacte o Lucas via WhatsApp para calcular o frete e verificar a disponibilidade!");
            liberarBotao();
            return; 
        }
    } catch (e) {
        console.warn("Verificação ignorada por demora. Seguindo para o cálculo.");
    }
    validarExpediente();
}

function validarExpediente() {
    const dataVal = document.getElementById('data_entrega').value;
    const horaVal = document.getElementById('hora_entrega').value;
    const d = new Date(dataVal + 'T' + horaVal);
    
    if(d.getDay() >= 1 && d.getDay() <= 5 && d.getHours() >= 8 && d.getHours() <= 17) {
        const modal = document.getElementById('modalExpediente');
        if(modal) modal.style.display = 'flex';
        else buscarRota(); 
    } else { 
        buscarRota(); 
    }
}

function continuarCalculo() {
    document.getElementById('modalExpediente').style.display = 'none';
    buscarRota();
}

// ==========================================
// CÁLCULO DE ROTA (O MOTOR PRINCIPAL)
// ==========================================
/**
 * Converte os endereços em coordenadas e desenha a rota no mapa.
 */
async function buscarRota() {
    const btn = document.getElementById('btn-calcular');
    btn.innerHTML = "⏳ CALCULANDO...";
    btn.disabled = true;

    // Prepara a string de busca do Destino Principal
    let queryBuscaP1 = tipoBusca === 'cep' 
        ? `${document.getElementById('rua_pelo_cep').value} ${document.getElementById('num_residencia_cep').value} São Paulo`
        : `${document.getElementById('destino').value} ${document.getElementById('num_residencia').value} São Paulo`;
    
    try {
        let waypointsDaRota = [ORIGEM_FIXA];

        // 1. Converte o Endereço 1 em Coordenada
        const respP1 = await fetch(`https://us1.locationiq.com/v1/search.php?key=${LOCATIONIQ_TOKEN}&q=${encodeURIComponent(queryBuscaP1)}&format=json&addressdetails=1`);
        const dataP1 = await respP1.json();
        
        if(!dataP1 || dataP1.length === 0) {
            mostrarAviso("1º Endereço não localizado com precisão. Verifique a escrita."); 
            liberarBotao();
            return;
        }

        const infoP1 = dataP1[0];
        waypointsDaRota.push(L.latLng(infoP1.lat, infoP1.lon));
        
        // Define o bairro Global assumindo inicialmente que a Parada 1 é o destino final
        if (tipoBusca === 'rua' && infoP1.address) {
            bairroGlobal = infoP1.address.suburb || infoP1.address.neighbourhood || infoP1.address.city_district || "SÃO PAULO";
        }

        // 2. Se tiver 2ª Parada, converte o Endereço 2 em Coordenada
        if (temParada2) {
            let tipoBuscaP2 = document.getElementById('campo-cep-p2').style.display === 'block' ? 'cep' : 'rua';
            let queryBuscaP2 = tipoBuscaP2 === 'cep' 
                ? `${document.getElementById('rua_pelo_cep_p2').value} ${document.getElementById('num_residencia_cep_p2').value} São Paulo`
                : `${document.getElementById('destino_parada2').value} ${document.getElementById('num_residencia_p2').value} São Paulo`;

            const respP2 = await fetch(`https://us1.locationiq.com/v1/search.php?key=${LOCATIONIQ_TOKEN}&q=${encodeURIComponent(queryBuscaP2)}&format=json&addressdetails=1`);
            const dataP2 = await respP2.json();

            if(!dataP2 || dataP2.length === 0) {
                mostrarAviso("2º Endereço (Parada 2) não localizado. Verifique a escrita."); 
                liberarBotao();
                return;
            }

            const infoP2 = dataP2[0];
            waypointsDaRota.push(L.latLng(infoP2.lat, infoP2.lon));
            
            // O Bairro Final do pedido passa a ser o bairro da última parada
            if (tipoBuscaP2 === 'rua' && infoP2.address) {
                bairroGlobal = infoP2.address.suburb || infoP2.address.neighbourhood || infoP2.address.city_district || "SÃO PAULO";
            }
        }
        
        // Finaliza Interface e entrega os pontos para o mapa desenhar
        document.getElementById('res-bairro').innerText = bairroGlobal.toUpperCase();
        document.getElementById('campo-resumo').style.display = 'block';
        document.getElementById('sec-tipo-local').style.display = 'block';
        
        setTimeout(() => {
            map.invalidateSize();
            control.setWaypoints(waypointsDaRota); // Pode enviar 2 ou 3 pontos agora
        }, 200);

    } catch (e) { 
        mostrarAviso("Erro de conexão ao buscar rota no mapa."); 
        liberarBotao();
    } 
}

// Evento escutado quando o mapa termina de processar a matemática da quilometragem
control.on('routesfound', function(e) {
    const routes = e.routes[0];
    const km = routes.summary.totalDistance / 1000;
    
    const tempoMin = Math.round(routes.summary.totalTime / 60) + 5;
    tempoGlobal = tempoMin + " MIN";
    
    const calculoBase = km * VALOR_POR_KM;
    const valorFinal = Math.max(TAXA_MINIMA, calculoBase);
    
    const valorFormatado = valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    document.getElementById('distancia').innerText = km.toFixed(2);
    document.getElementById('res-tempo').innerText = tempoGlobal;
    document.getElementById('valor').innerText = valorFormatado;
    
    document.getElementById('aviso-taxa').style.display = (calculoBase < TAXA_MINIMA ? 'block' : 'none');
    
    // Constrói a string de log (Origem -> Destino)
    let enderecoBuscado = tipoBusca === 'cep' 
        ? `${document.getElementById('rua_pelo_cep').value}, ${document.getElementById('num_residencia_cep').value}`
        : `${document.getElementById('destino').value}, ${document.getElementById('num_residencia').value}`;
    
    if (temParada2) {
        let tipoBuscaP2 = document.getElementById('campo-cep-p2').style.display === 'block' ? 'cep' : 'rua';
        let endP2 = tipoBuscaP2 === 'cep' 
            ? `${document.getElementById('rua_pelo_cep_p2').value}, ${document.getElementById('num_residencia_cep_p2').value}`
            : `${document.getElementById('destino_parada2').value}, ${document.getElementById('num_residencia_p2').value}`;
        enderecoBuscado += ` | PARADA 2: ${endP2}`;
    }
    
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

/**
 * Monta a mensagem final do WhatsApp com ou sem a 2ª parada.
 */
function finalizarEnvio() {
    const bloco = document.getElementById('bloco').value;
    const apto = document.getElementById('apto').value;
    
    let dest1 = tipoBusca === 'cep' ? 
        `${document.getElementById('rua_pelo_cep').value}, ${document.getElementById('num_residencia_cep').value} (CEP: ${document.getElementById('cep').value})` :
        `${document.getElementById('destino').value}, ${document.getElementById('num_residencia').value}`;

    let destFinalTexto = dest1;

    // Incrementa a parada na mensagem do WhatsApp
    if (temParada2) {
        let tipoBuscaP2 = document.getElementById('campo-cep-p2').style.display === 'block' ? 'cep' : 'rua';
        let dest2 = tipoBuscaP2 === 'cep' ? 
            `${document.getElementById('rua_pelo_cep_p2').value}, ${document.getElementById('num_residencia_cep_p2').value}` :
            `${document.getElementById('destino_parada2').value}, ${document.getElementById('num_residencia_p2').value}`;
        
        destFinalTexto = `1ª PARADA: ${dest1}%0A🛑 2ª PARADA: ${dest2}`;
    }

    const dados = {
        data: obterDataFormatada(document.getElementById('data_entrega').value),
        hora: document.getElementById('hora_entrega').value,
        nome: document.getElementById('nome_cliente').value,
        destino: destFinalTexto.replace(/%0A/g, " - "), // Remove a quebra de linha pro Google Sheets
        bairro: bairroGlobal.toUpperCase(),
        ref: document.getElementById('ponto_referencia').value || "NÃO INFORMADO",
        km: document.getElementById('distancia').innerText,
        valor: document.getElementById('valor').innerText,
        tipo: tipoResidencia.toUpperCase(),
        bloco: bloco || "---",
        apto: apto || "---"
    };

    let msg = `*NOVO PEDIDO - ALENCAR FRETES*%0A%0A`;
    msg += `📅 *DATA:* ${dados.data}%0A⏰ *HORA:* ${dados.hora}%0A👤 *CLIENTE:* ${dados.nome}%0A🏘️ *BAIRRO (Final):* ${dados.bairro}%0A⏱️ *TEMPO EST.:* ${tempoGlobal}%0A`;
    msg += `🏁 *ROTA:* %0A${destFinalTexto}%0A`;
    
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
// REGISTRO DE DADOS NO GOOGLE SHEETS
// ==========================================
async function registrarLogJS(km, valor, endereco, bairro) {
    let textoDispositivo = navigator.userAgent;
    let dispFormatado = "📱 Outro/Desconhecido";
    
    if (/android/i.test(textoDispositivo)) dispFormatado = "📱 Celular Android";
    else if (/iPad|iPhone|iPod/.test(textoDispositivo)) dispFormatado = "🍎 iPhone / iPad";
    else if (/windows/i.test(textoDispositivo)) dispFormatado = "💻 Computador Windows";
    else if (/mac/i.test(textoDispositivo)) dispFormatado = "💻 Computador Mac";

    let ipUsuario = await obterIpUsuario();

    let pacoteDeDados = { 
        data: new Date().toLocaleString("pt-BR"), 
        ip: ipUsuario, 
        dispositivo: dispFormatado, 
        endereco: endereco, 
        bairro: bairro, 
        km: km, 
        valor: valor 
    };
    
    try {
        const requisicao = await fetch(GOOGLE_SCRIPT_URL_LOG, { 
            method: "POST", 
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(pacoteDeDados) 
        });

        const resposta = await requisicao.json();

        if (resposta.result === "bloqueado") {
            mostrarAviso("⚠️ Seu dispositivo excedeu o limite de 5 cotações nesta semana.");
            return;
        }

        if (resposta.result === "sucesso") {
            console.log("✅ Dados salvos e acesso contabilizado com sucesso!");
        }

    } catch (erro) {
        console.error("Erro ao enviar dados: ", erro);
    }
}
