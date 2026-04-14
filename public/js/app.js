/* ═══════════════════════════════════════════════
   QUALITYDESK NCF v4.1 — app.js
   ═══════════════════════════════════════════════ */

const MAPPING = {
    "Injeção":            Array.from({length: 34}, (_, i) => `INJ ${String(i+1).padStart(2,'0')}`),
    "Metalização":        ["MTLZ PV", "MTLZ KOLZER 01", "MTLZ KOLZER 02", "MTLZ BUHLER"],
    "Montagem Small":     Array.from({length: 20}, (_, i) => `UAP ${String(i+1).padStart(2,'0')}`),
    "Montagem Lanternas": ["Linha 01", "Linha 02", "Linha 03", "Linha 04", "Linha 05", "Linha 06"]
};

const PRODUTOS_SETOR = {
    "Injeção":            ["Lente", "Corpo", "Aba", "Refletor Injetado", "Moldura", "Guia de Luz"],
    "Metalização":        ["Refletor Metalizado", "Corpo Metalizado", "Mascara Metalizada"],
    "Montagem Small":     ["Break Light", "Side Repeater", "Plafonieira", "Luz de Placa", "Rear Reflex", "Farol"],
    "Montagem Lanternas": ["Lanterna Fixa", "Lanterna Movel", "Lanterna Base", "Lanterna UP"]
};

const CLIENTES_LISTA   = ["GM", "TOYOTA", "VW", "FIAT", "JEEP"];
const INSPETORES_LISTA = ["JONATHAN", "GABRIEL", "ALEXANDRO", "ISAIAS"];
const MOTIVOS_LISTA    = ["Mancha", "Deformação", "Impureza", "Risco", "Quebra"];

function calcularTurnoLocal() {
    const n = new Date();
    const min = n.getHours() * 60 + n.getMinutes();
    if (min >= 375 && min < 855)  return "1° Turno";
    if (min >= 855 && min < 1335) return "2° Turno";
    return "3° Turno";
}

/* ─── VALIDAÇÃO DE DATA ─── */
/* Retorna true se a data está dentro da janela permitida:
   hoje e até 2 dias anteriores ao dia atual */
function dataDentroDoLimite(dStr) {
    const hoje    = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite  = new Date(hoje);
    limite.setDate(hoje.getDate() - 2);   // 2 dias atrás
    const alvo    = new Date(dStr + 'T00:00:00');
    // Permite: de 2 dias atrás até hoje (não permite datas futuras)
    return alvo >= limite && alvo <= hoje;
}

function diasAtraso(dStr) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const alvo = new Date(dStr + 'T00:00:00');
    return Math.round((hoje - alvo) / (1000 * 60 * 60 * 24));
}

/* ─── ESTADO GLOBAL ─── */
let DB         = [];
let analytics  = null;
let selectedDate  = null;
let selectedColor = null;
let currentMonth  = new Date().getMonth() + 1;
let currentYear   = new Date().getFullYear();

const drillState = {
    setor: { nivel: 'global', valor: null, label: [] }
};

const charts = {};

/* ─── FILTROS ANALYTICS ─── */
let filterAno     = new Date().getFullYear();
let filterMes     = '';
let filterMotivo  = '';
let filterCliente = '';
let filterProduto = '';
let filterInspetor= '';

/* ─── INIT ─── */
async function init() {
    await loadData();
    renderCalendar();
    updateClock();
    renderMesNome();
    populateFilterDropdowns();
}

async function loadData() {
    try {
        const [regRes, anaRes] = await Promise.all([
            fetch('/api/registros'),
            fetch('/api/analytics/resumo')
        ]);
        DB        = await regRes.json();
        analytics = await anaRes.json();
    } catch(e) {
        showToast('Erro ao carregar dados', 'error');
    }
}

/* ─── CLOCK ─── */
function updateClock() {
    setInterval(() => {
        const n = new Date();
        document.getElementById('clock').innerText = n.toLocaleTimeString('pt-BR');
        const turno = calcularTurnoLocal();
        const badge = document.getElementById('shift-badge');
        badge.innerText = turno;
        badge.className = 'badge ' + (turno.startsWith('1') ? 't1' : turno.startsWith('2') ? 't2' : 't3');
    }, 1000);
}

/* ─── MES NOME ─── */
const MESES = ['','JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
               'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function renderMesNome() {
    document.getElementById('mes-nome').innerText = MESES[currentMonth];
}

/* ─── CALENDÁRIO ─── */
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const diasNoMes   = new Date(currentYear, currentMonth, 0).getDate();
    const primeiroDia = new Date(currentYear, currentMonth - 1, 1).getDay();
    let cRed = 0, cYellow = 0, cGreen = 0;

    for (let i = 0; i < primeiroDia; i++) {
        const e = document.createElement('div'); e.className = 'dia empty'; grid.appendChild(e);
    }

    for (let i = 1; i <= diasNoMes; i++) {
        const dStr    = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const regsDia = DB.filter(r => r.dataCal === dStr);
        const isToday = dStr === new Date().toISOString().slice(0,10);

        let cor = '';
        if      (regsDia.some(r => r.cor === 'red'))    { cor = 'red';    cRed++; }
        else if (regsDia.some(r => r.cor === 'yellow'))  { cor = 'yellow'; cYellow++; }
        else if (regsDia.some(r => r.cor === 'green'))   { cor = 'green';  cGreen++; }

        const permitido = dataDentroDoLimite(dStr);
        const isFuturo  = new Date(dStr + 'T00:00:00') > new Date(new Date().toISOString().slice(0,10) + 'T00:00:00');

        let extraClass = '';
        if (isFuturo)        extraClass = ' bloqueado futuro';
        else if (!permitido) extraClass = ' bloqueado passado';

        const div = document.createElement('div');
        div.className = `dia ${cor}${isToday ? ' today' : ''}${selectedDate === dStr ? ' selected' : ''}${extraClass}`;
        div.innerText = i;
        div.title     = isFuturo    ? 'Data futura — não permitido'
                      : !permitido  ? 'Apontamento bloqueado (limite: 2 dias anteriores)'
                      : '';

        if (regsDia.length > 1) {
            const badge = document.createElement('div');
            badge.className = 'dia-badge';
            badge.innerText = regsDia.length;
            div.appendChild(badge);
        }

        if (permitido) {
            div.onclick = () => openDiary(dStr);
        } else {
            div.onclick = () => openDiarioSoLeitura(dStr);
        }
        grid.appendChild(div);
    }

    document.getElementById('count-red').innerText    = cRed;
    document.getElementById('count-yellow').innerText = cYellow;
    document.getElementById('count-green').innerText  = cGreen;
}

function prevMonth() {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    renderCalendar(); renderMesNome();
}
function nextMonth() {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    renderCalendar(); renderMesNome();
}

/* ─── DIÁRIO ─── */
function openDiary(date) {
    selectedDate  = date;
    selectedColor = null;

    document.querySelectorAll('.dia.selected').forEach(d => d.classList.remove('selected'));
    const dayNum = parseInt(date.split('-')[2]);
    const dias   = document.querySelectorAll('.dia:not(.empty)');
    if (dias[dayNum - 1]) dias[dayNum - 1].classList.add('selected');

    document.getElementById('dia-label').innerText = formatDateBR(date);
    document.getElementById('fields').classList.add('hidden');
    document.querySelectorAll('.circle').forEach(c => c.classList.remove('active'));

    const setorSel = document.getElementById('setor');
    setorSel.innerHTML = '<option value="">Selecione...</option>';
    Object.keys(MAPPING).forEach(s => {
        setorSel.innerHTML += `<option value="${s}">${s}</option>`;
    });

    document.getElementById('diary-placeholder').style.display = 'none';
    document.getElementById('registros-dia').style.display = 'block';
    document.getElementById('form-nc').classList.remove('hidden');
    renderRegistrosDia(date);
}

/* ─── DIÁRIO SOMENTE LEITURA (dias bloqueados) ─── */
function openDiarioSoLeitura(date) {
    selectedDate  = date;
    selectedColor = null;

    document.querySelectorAll('.dia.selected').forEach(d => d.classList.remove('selected'));
    const dayNum = parseInt(date.split('-')[2]);
    const dias   = document.querySelectorAll('.dia:not(.empty)');
    if (dias[dayNum - 1]) dias[dayNum - 1].classList.add('selected');

    document.getElementById('dia-label').innerText = formatDateBR(date);
    document.getElementById('diary-placeholder').style.display = 'none';
    document.getElementById('registros-dia').style.display = 'block';
    document.getElementById('form-nc').classList.add('hidden');

    const atraso   = diasAtraso(date);
    const isFuturo = atraso < 0;
    const msg = isFuturo
        ? '\uD83D\uDD12 Data futura — apontamentos não são permitidos.'
        : `\uD83D\uDD12 Bloqueado — ${atraso} dia(s) atrás. Limite permitido: 2 dias anteriores.`;

    const regs = DB.filter(r => r.dataCal === date);
    let html = `<div style="background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.25);border-radius:5px;padding:8px 12px;margin-bottom:10px;font-size:0.78rem;color:#f85149;">${msg}</div>`;

    if (regs.length) {
        html += regs.map(r => `
            <div class="registro-item">
                <div class="ri-cor ${r.cor}"></div>
                <div class="ri-info">
                    <div class="ri-setor">${r.setor || '—'} · ${r.maquina || '—'}</div>
                    <div class="ri-detalhes">${r.produto ? 'Produto: ' + r.produto : ''} ${r.cliente ? '| ' + r.cliente : ''} ${r.quantidade ? '| Qtd: ' + r.quantidade : ''} | ${r.turno || '—'}</div>
                    ${r.motivo ? '<div class="ri-detalhes" style="color:#c9d1d9">Motivo: ' + r.motivo + '</div>' : ''}
                    ${r.inspetor ? '<div class="ri-detalhes">Inspetor: ' + r.inspetor + '</div>' : ''}
                </div>
            </div>`).join('');
    } else {
        html += '<div style="color:#6e7681;font-size:0.78rem;text-align:center;padding:8px;">Nenhum apontamento neste dia</div>';
    }
    document.getElementById('registros-dia').innerHTML = html;
}

function renderRegistrosDia(date) {
    const container = document.getElementById('registros-dia');
    const regs = DB.filter(r => r.dataCal === date);

    if (!regs.length) {
        container.innerHTML = '<div style="color:#6e7681;font-size:0.78rem;text-align:center;padding:10px;">Nenhum apontamento neste dia</div>';
        return;
    }

    container.innerHTML = regs.map(r => `
        <div class="registro-item">
            <div class="ri-cor ${r.cor}"></div>
            <div class="ri-info">
                <div class="ri-setor">${r.setor || '—'} · ${r.maquina || '—'}</div>
                <div class="ri-detalhes">
                    ${r.produto ? `Produto: ${r.produto}` : ''}
                    ${r.cliente ? `| Cliente: ${r.cliente}` : ''}
                    ${r.quantidade ? `| Qtd: ${r.quantidade}` : ''}
                    | ${r.turno || '—'}
                </div>
                ${r.motivo ? `<div class="ri-detalhes" style="margin-top:2px;color:#c9d1d9">Motivo: ${r.motivo}</div>` : ''}
                ${r.descricao ? `<div class="ri-detalhes" style="margin-top:2px;color:#c9d1d9;font-style:italic">${r.descricao}</div>` : ''}
                ${r.inspetor ? `<div class="ri-detalhes">Inspetor: ${r.inspetor}</div>` : ''}
            </div>
            <button class="ri-delete" onclick="deleteRegistro(${r.id})" title="Excluir">✕</button>
        </div>
    `).join('');
}

async function deleteRegistro(id) {
    if (!confirm('Excluir este apontamento?')) return;
    await fetch(`/api/registros/${id}`, { method: 'DELETE' });
    await loadData();
    renderCalendar();
    if (selectedDate) renderRegistrosDia(selectedDate);
    showToast('Apontamento excluído', 'success');
}

/* ─── SETOR → LINHAS → PRODUTOS (cascata) ─── */
function loadLines() {
    const s = document.getElementById('setor').value;
    const m = document.getElementById('maquina');
    m.innerHTML = MAPPING[s]
        ? MAPPING[s].map(l => `<option value="${l}">${l}</option>`).join('')
        : '<option value="">—</option>';

    const p = document.getElementById('produto');
    p.innerHTML = '<option value="">Selecione...</option>';
    if (PRODUTOS_SETOR[s]) {
        PRODUTOS_SETOR[s].forEach(prod => {
            p.innerHTML += `<option value="${prod}">${prod}</option>`;
        });
    }
}

function setCor(c, el) {
    selectedColor = c;
    document.querySelectorAll('.circle').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('fields').classList.remove('hidden');
}

async function saveData() {
    if (!selectedDate)  { showToast('Selecione um dia no calendário', 'error'); return; }
    if (!dataDentroDoLimite(selectedDate)) {
        showToast('❌ Apontamento retroativo bloqueado! Limite: 2 dias anteriores.', 'error');
        return;
    }
    if (!selectedColor) { showToast('Selecione o tipo de ocorrência', 'error'); return; }

    const setor = document.getElementById('setor').value;
    if (selectedColor !== 'green' && !setor) { showToast('Selecione o setor', 'error'); return; }

    const payload = {
        dataCal:   selectedDate,
        cor:       selectedColor,
        setor:     setor,
        maquina:   document.getElementById('maquina').value,
        produto:   document.getElementById('produto').value,
        cliente:   document.getElementById('cliente').value,
        motivo:    document.getElementById('motivo').value,
        descricao: document.getElementById('descricao').value,
        inspetor:  document.getElementById('inspetor').value,
        quantidade: parseInt(document.getElementById('qtd').value) || 0
    };

    await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    document.getElementById('fields').classList.add('hidden');
    document.querySelectorAll('.circle').forEach(c => c.classList.remove('active'));
    selectedColor = null;
    ['descricao','qtd'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('setor').value    = '';
    document.getElementById('produto').value  = '';
    document.getElementById('cliente').value  = '';
    document.getElementById('motivo').value   = '';
    document.getElementById('inspetor').value = '';

    await loadData();
    renderCalendar();
    renderRegistrosDia(selectedDate);
    showToast('Apontamento salvo com sucesso!', 'success');
}

/* ─── TAB SWITCH ─── */
function switchTab(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    el.classList.add('active');
    if (tabId === 'tab-graficos') {
        renderKPIs();
        renderAllCharts();
    }
}

/* ─── POPULAR DROPDOWNS DE FILTRO ─── */
function populateFilterDropdowns() {
    const selMotivo   = document.getElementById('filter-motivo');
    const selCliente  = document.getElementById('filter-cliente');
    const selProduto  = document.getElementById('filter-produto');
    const selInspetor = document.getElementById('filter-inspetor');

    MOTIVOS_LISTA.forEach(m   => { selMotivo.innerHTML   += `<option value="${m}">${m}</option>`; });
    CLIENTES_LISTA.forEach(c  => { selCliente.innerHTML  += `<option value="${c}">${c}</option>`; });
    INSPETORES_LISTA.forEach(i=> { selInspetor.innerHTML += `<option value="${i}">${i}</option>`; });

    const todosProds = [...new Set(Object.values(PRODUTOS_SETOR).flat())];
    todosProds.forEach(p => { selProduto.innerHTML += `<option value="${p}">${p}</option>`; });
}

/* ─── FILTROS ─── */
function getDBFiltrado() {
    let regs = [...DB];
    if (filterAno)     regs = regs.filter(r => new Date(r.timestamp).getFullYear() == filterAno);
    if (filterMes)     regs = regs.filter(r => (new Date(r.timestamp).getMonth() + 1) == filterMes);
    if (filterMotivo)  regs = regs.filter(r => r.motivo   === filterMotivo);
    if (filterCliente) regs = regs.filter(r => r.cliente  === filterCliente);
    if (filterProduto) regs = regs.filter(r => r.produto  === filterProduto);
    if (filterInspetor)regs = regs.filter(r => r.inspetor === filterInspetor);
    return regs;
}

function applyFilter() {
    filterAno      = parseInt(document.getElementById('filter-ano').value)  || '';
    filterMes      = document.getElementById('filter-mes').value;
    filterMotivo   = document.getElementById('filter-motivo').value;
    filterCliente  = document.getElementById('filter-cliente').value;
    filterProduto  = document.getElementById('filter-produto').value;
    filterInspetor = document.getElementById('filter-inspetor').value;

    if (filterAno)     currentYear  = filterAno;
    if (filterMes)     currentMonth = parseInt(filterMes);
    renderMesNome();
    renderCalendar();
    renderKPIs();
    renderAllCharts();
}

/* ─── KPIs ─── */
function renderKPIs() {
    const regs = getDBFiltrado();
    const nc   = regs.filter(r => r.cor !== 'green');

    document.getElementById('kpi-total').innerText   = nc.length;
    document.getElementById('kpi-red').innerText     = nc.filter(r => r.cor === 'red').length;
    document.getElementById('kpi-yellow').innerText  = nc.filter(r => r.cor === 'yellow').length;
    document.getElementById('kpi-green').innerText   = regs.filter(r => r.cor === 'green').length;

    const cliCount = {};
    nc.forEach(r => { if (r.cliente) cliCount[r.cliente] = (cliCount[r.cliente] || 0) + 1; });
    const top = Object.entries(cliCount).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('kpi-top-cliente').innerText = top ? top[0] : '—';
}

/* ─── CHARTS ─── */
const CHART_COLORS = {
    bg:     '#161b22',
    border: '#21262d',
    text:   '#6e7681',
    text2:  '#c9d1d9',
    grid:   '#21262d',
    red:    '#f85149',
    yellow: '#d29922',
    green:  '#2ea043',
    blue:   '#58a6ff',
    purple: '#8957e5'
};

const BASE_OPTS = {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Nunito, sans-serif', color: CHART_COLORS.text }
};

function makeChart(id) {
    if (charts[id]) charts[id].dispose();
    const el = document.getElementById(id);
    if (!el) return null;
    charts[id] = echarts.init(el, null, { renderer: 'canvas' });
    return charts[id];
}

function axisBase() {
    return {
        axisLine:  { lineStyle: { color: CHART_COLORS.border } },
        axisLabel: { color: CHART_COLORS.text, fontSize: 10, fontFamily: 'Nunito' },
        splitLine: { lineStyle: { color: CHART_COLORS.grid, type: 'dashed' } }
    };
}

async function renderAllCharts() {
    renderTendencia();
    renderParetoSetor();
    renderTurnoPie();
    renderClienteBar();
    renderProdutoBar();
    renderAnualBar();
    renderMotivoBar();
    renderInspetorBar();
    renderLinhaSetor();
}

/* ── Tendência Mensal ── */
function renderTendencia() {
    const regs  = getDBFiltrado().filter(r => r.cor !== 'green');
    const ano   = filterAno || currentYear;
    const mes   = filterMes || currentMonth;
    const dias  = new Date(ano, mes, 0).getDate();
    const labels = Array.from({length: dias}, (_, i) => i + 1);
    const META   = 3;

    const totalArr = labels.map(d => {
        const dStr = `${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        return regs.filter(r => r.dataCal === dStr).length;
    });
    const redArr = labels.map(d => {
        const dStr = `${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        return regs.filter(r => r.dataCal === dStr && r.cor === 'red').length;
    });
    const yelArr = labels.map(d => {
        const dStr = `${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        return regs.filter(r => r.dataCal === dStr && r.cor === 'yellow').length;
    });

    const chart = makeChart('chart-trend');
    if (!chart) return;
    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 35, right: 20, bottom: 40, left: 40 },
        legend: { data: ['Total NC', 'Ext. Cliente', 'Interna', 'Meta'], textStyle: { color: CHART_COLORS.text }, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'category', data: labels, ...axisBase() },
        yAxis: { type: 'value', min: 0, ...axisBase() },
        series: [
            { name: 'Total NC', type: 'bar', data: totalArr, itemStyle: { color: '#253447', borderRadius: [3,3,0,0] }, label: { show: true, position: 'top', color: CHART_COLORS.text, fontSize: 9 } },
            { name: 'Ext. Cliente', type: 'line', data: redArr, smooth: true, lineStyle: { color: CHART_COLORS.red, width: 2 }, itemStyle: { color: CHART_COLORS.red }, symbol: 'circle', symbolSize: 5,
              areaStyle: { color: { type: 'linear', x:0,y:0,x2:0,y2:1, colorStops: [{offset:0,color:'rgba(248,81,73,0.2)'},{offset:1,color:'rgba(248,81,73,0)'}] } } },
            { name: 'Interna', type: 'line', data: yelArr, smooth: true, lineStyle: { color: CHART_COLORS.yellow, width: 2 }, itemStyle: { color: CHART_COLORS.yellow }, symbol: 'circle', symbolSize: 5 },
            { name: 'Meta', type: 'line', data: labels.map(() => META), lineStyle: { color: CHART_COLORS.green, width: 1.5, type: 'dashed' }, symbol: 'none', itemStyle: { color: CHART_COLORS.green }, tooltip: { show: false } }
        ]
    });
}

/* ── Pareto por Setor com drill-down ── */
async function renderParetoSetor(nivel, valor) {
    const chart = makeChart('chart-setor');
    if (!chart) return;

    const regs = getDBFiltrado().filter(r => r.cor !== 'green');
    let data;

    if (!nivel || nivel === 'global') {
        const map = {};
        regs.forEach(r => { if (r.setor) map[r.setor] = (map[r.setor] || 0) + 1; });
        data = Object.entries(map).sort((a,b) => b[1]-a[1]);
        drillState.setor = { nivel: 'global', valor: null, label: [] };
    } else if (nivel === 'setor') {
        const map = {};
        regs.filter(r => r.setor === valor).forEach(r => { if (r.maquina) map[r.maquina] = (map[r.maquina] || 0) + 1; });
        data = Object.entries(map).sort((a,b) => b[1]-a[1]);
        drillState.setor = { nivel: 'setor', valor, label: [valor] };
    } else if (nivel === 'maquina') {
        const map = {};
        regs.filter(r => r.maquina === valor).forEach(r => { const k = r.motivo || 'Sem motivo'; map[k] = (map[k] || 0) + 1; });
        data = Object.entries(map).sort((a,b) => b[1]-a[1]);
        drillState.setor.label.push(valor);
    }

    const labels = data.map(d => d[0]);
    const values = data.map(d => d[1]);
    const total  = values.reduce((a,b) => a+b, 0);
    let acc = 0;
    const paretoLine = values.map(v => { acc += v; return total ? Math.round(acc/total*100) : 0; });
    const colors = [CHART_COLORS.red,'#ff6b6b',CHART_COLORS.yellow,'#ffd060',CHART_COLORS.blue,'#388bfd',CHART_COLORS.green,'#4caf50'];

    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 30, right: 60, bottom: 55, left: 40 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'category', data: labels, axisLabel: { color: CHART_COLORS.text, fontSize: 9, rotate: labels.length > 6 ? 30 : 0, interval: 0 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
        yAxis: [
            { type: 'value', ...axisBase() },
            { type: 'value', min: 0, max: 100, axisLabel: { color: CHART_COLORS.text, fontSize: 9, formatter: '{value}%' }, splitLine: { show: false }, axisLine: { lineStyle: { color: CHART_COLORS.border } } }
        ],
        series: [
            { name: 'Ocorrências', type: 'bar', data: values.map((v,i) => ({ value: v, itemStyle: { color: colors[i % colors.length], borderRadius: [4,4,0,0] } })), label: { show: true, position: 'top', fontSize: 10, color: CHART_COLORS.text2 } },
            { name: 'Acumulado', type: 'line', yAxisIndex: 1, data: paretoLine, lineStyle: { color: CHART_COLORS.blue, width: 2 }, itemStyle: { color: CHART_COLORS.blue }, symbol: 'circle', symbolSize: 5, label: { show: true, position: 'top', fontSize: 9, color: CHART_COLORS.blue, formatter: '{c}%' } }
        ]
    });

    updateBreadcrumb('setor-breadcrumb', drillState.setor.label, 'renderParetoSetor');
    chart.off('click');
    if (!nivel || nivel === 'global') { chart.on('click', p => renderParetoSetor('setor', p.name)); }
    else if (nivel === 'setor')       { chart.on('click', p => renderParetoSetor('maquina', p.name)); }
}

/* ── Turno Pie ── */
function renderTurnoPie() {
    const chart = makeChart('chart-turno');
    if (!chart) return;
    const regs = getDBFiltrado().filter(r => r.cor !== 'green');
    const tMap = { "1° Turno": 0, "2° Turno": 0, "3° Turno": 0 };
    regs.forEach(r => { if (r.turno) tMap[r.turno] = (tMap[r.turno] || 0) + 1; });
    const tColors = { '1° Turno': CHART_COLORS.green, '2° Turno': CHART_COLORS.yellow, '3° Turno': CHART_COLORS.blue };
    chart.setOption({
        ...BASE_OPTS,
        tooltip: { trigger: 'item', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 }, formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 8, textStyle: { color: CHART_COLORS.text, fontSize: 10 }, icon: 'circle' },
        series: [{ type: 'pie', radius: ['38%', '68%'], center: ['50%', '44%'],
            data: Object.entries(tMap).map(([name, value]) => ({ name, value, itemStyle: { color: tColors[name] } })),
            label: { formatter: '{b}\n{d}%', color: CHART_COLORS.text2, fontSize: 11 },
            labelLine: { lineStyle: { color: CHART_COLORS.border } },
            emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.4)' } }
        }]
    });
}

/* ── Top Clientes ── */
function renderClienteBar() {
    const chart = makeChart('chart-cliente');
    if (!chart) return;
    const regs   = getDBFiltrado().filter(r => r.cor !== 'green');
    const cMap   = {};
    regs.forEach(r => { if (r.cliente && r.cliente !== 'Interno') cMap[r.cliente] = (cMap[r.cliente] || 0) + 1; });
    const sorted = Object.entries(cMap).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const labels = sorted.map(d => d[0]);
    const values = sorted.map(d => d[1]);
    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 20, right: 20, bottom: 40, left: 100 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'value', ...axisBase() },
        yAxis: { type: 'category', data: labels.reverse(), axisLabel: { color: CHART_COLORS.text2, fontSize: 11 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
        series: [{ type: 'bar', data: values.reverse().map(v => ({ value: v, itemStyle: { color: { type: 'linear', x:0,y:0,x2:1,y2:0, colorStops: [{offset:0,color:'rgba(248,81,73,0.3)'},{offset:1,color:CHART_COLORS.red}] }, borderRadius: [0,4,4,0] } })), label: { show: true, position: 'right', color: CHART_COLORS.text2, fontSize: 10 } }]
    });
}

/* ── Top Produtos ── */
function renderProdutoBar() {
    const chart = makeChart('chart-produto');
    if (!chart) return;
    const regs   = getDBFiltrado().filter(r => r.cor !== 'green');
    const pMap   = {};
    regs.forEach(r => { if (r.produto) pMap[r.produto] = (pMap[r.produto] || 0) + 1; });
    const sorted = Object.entries(pMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
    const labels = sorted.map(d => d[0]);
    const values = sorted.map(d => d[1]);
    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 20, right: 20, bottom: 55, left: 40 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'category', data: labels, axisLabel: { color: CHART_COLORS.text, fontSize: 9, rotate: 20 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
        yAxis: { type: 'value', ...axisBase() },
        series: [{ type: 'bar', data: values.map(v => ({ value: v, itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:CHART_COLORS.blue},{offset:1,color:'rgba(88,166,255,0.2)'}] }, borderRadius: [4,4,0,0] } })), label: { show: true, position: 'top', color: CHART_COLORS.text2, fontSize: 10 } }]
    });
}

/* ── Tendência Anual ── */
function renderAnualBar() {
    const chart = makeChart('chart-anual');
    if (!chart) return;
    const regs = getDBFiltrado().filter(r => r.cor !== 'green');
    const ano  = filterAno || currentYear;
    const mAbrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const META_MENSAL = 10;
    const mesesData = mAbrev.map((label, idx) => {
        const m  = idx + 1;
        const v  = regs.filter(r => new Date(r.timestamp).getFullYear() == ano && (new Date(r.timestamp).getMonth() + 1) == m).length;
        return { label, value: v };
    });

    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 30, right: 20, bottom: 40, left: 40 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'category', data: mesesData.map(d => d.label), ...axisBase() },
        yAxis: { type: 'value', ...axisBase() },
        series: [
            { name: 'NC/Mês', type: 'bar', data: mesesData.map(d => ({ value: d.value, itemStyle: { color: d.value > META_MENSAL ? CHART_COLORS.red : d.value > META_MENSAL * 0.7 ? CHART_COLORS.yellow : CHART_COLORS.green, borderRadius: [4,4,0,0] } })), label: { show: true, position: 'top', color: CHART_COLORS.text2, fontSize: 10 } },
            { name: 'Meta', type: 'line', data: mAbrev.map(() => META_MENSAL), lineStyle: { color: CHART_COLORS.green, width: 1.5, type: 'dashed' }, symbol: 'none', itemStyle: { color: CHART_COLORS.green } }
        ]
    });

    chart.off('click');
    chart.on('click', p => {
        const idx = mAbrev.indexOf(p.name);
        if (idx >= 0) { currentMonth = idx + 1; renderMesNome(); renderCalendar(); renderTendencia(); }
    });
}

/* ── Motivos (Pareto) ── */
function renderMotivoBar() {
    const chart = makeChart('chart-motivo');
    if (!chart) return;
    const regs = getDBFiltrado().filter(r => r.cor !== 'green');
    const mMap = {};
    regs.forEach(r => { if (r.motivo) mMap[r.motivo] = (mMap[r.motivo] || 0) + 1; });
    const sorted = Object.entries(mMap).sort((a,b) => b[1]-a[1]);
    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 20, right: 20, bottom: 50, left: 40 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'category', data: sorted.map(d => d[0]), axisLabel: { color: CHART_COLORS.text, fontSize: 9, rotate: 15 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
        yAxis: { type: 'value', ...axisBase() },
        series: [{ type: 'bar', data: sorted.map((d,i) => ({
            value: d[1],
            itemStyle: { color: [CHART_COLORS.red, CHART_COLORS.yellow, CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.purple][i % 5], borderRadius: [4,4,0,0] }
        })), label: { show: true, position: 'top', color: CHART_COLORS.text2, fontSize: 10 } }]
    });
}

/* ── Inspetor Bar ── */
function renderInspetorBar() {
    const chart = makeChart('chart-inspetor');
    if (!chart) return;
    const regs = getDBFiltrado().filter(r => r.cor !== 'green');
    const iMap = {};
    regs.forEach(r => { if (r.inspetor) iMap[r.inspetor] = (iMap[r.inspetor] || 0) + 1; });
    const sorted = Object.entries(iMap).sort((a,b) => b[1]-a[1]);
    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 20, right: 20, bottom: 50, left: 40 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'category', data: sorted.map(d => d[0]), axisLabel: { color: CHART_COLORS.text, fontSize: 10 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
        yAxis: { type: 'value', ...axisBase() },
        series: [{ type: 'bar', data: sorted.map(d => ({ value: d[1], itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:CHART_COLORS.purple},{offset:1,color:'rgba(137,87,229,0.2)'}] }, borderRadius: [4,4,0,0] } })), label: { show: true, position: 'top', color: CHART_COLORS.text2, fontSize: 10 } }]
    });
}

/* ── Top Linhas / Máquinas ── */
function renderLinhaSetor() {
    const chart = makeChart('chart-linha');
    if (!chart) return;
    const regs = getDBFiltrado().filter(r => r.cor !== 'green');
    const lMap = {};
    regs.forEach(r => { if (r.maquina) lMap[r.maquina] = (lMap[r.maquina] || 0) + 1; });
    const topLinhas = Object.entries(lMap).sort((a,b) => b[1]-a[1]).slice(0,15);
    const colorMap  = { 'Injeção': CHART_COLORS.blue, 'Metalização': CHART_COLORS.yellow, 'Montagem Small': CHART_COLORS.green, 'Montagem Lanternas': CHART_COLORS.red };

    chart.setOption({
        ...BASE_OPTS,
        grid: { top: 30, right: 20, bottom: 60, left: 40 },
        tooltip: { trigger: 'axis', backgroundColor: CHART_COLORS.bg, borderColor: CHART_COLORS.border, textStyle: { color: CHART_COLORS.text2 } },
        xAxis: { type: 'category', data: topLinhas.map(d => d[0]), axisLabel: { color: CHART_COLORS.text, fontSize: 9, rotate: 35, interval: 0 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
        yAxis: { type: 'value', ...axisBase() },
        series: [{ type: 'bar', data: topLinhas.map(([k,v]) => {
            const setor = Object.entries(MAPPING).find(([s, linhas]) => linhas.includes(k))?.[0];
            return { value: v, itemStyle: { color: colorMap[setor] || CHART_COLORS.text, borderRadius: [3,3,0,0] } };
        }), label: { show: true, position: 'top', fontSize: 9, color: CHART_COLORS.text2 } }]
    });
}

/* ─── BREADCRUMB ─── */
function updateBreadcrumb(id, labels, backFn) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!labels || !labels.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const parts = [`<span onclick="${backFn}()">← TODOS SETORES</span>`];
    labels.forEach(l => { parts.push('<span class="sep">›</span>'); parts.push(`<span>${l}</span>`); });
    el.innerHTML = parts.join(' ');
}

/* ─── TOAST ─── */
function showToast(msg, type = 'success') {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className   = `toast ${type}`;
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => t.classList.remove('show'), 3000);
}

function formatDateBR(dStr) {
    const [y,m,d] = dStr.split('-');
    return `${d}/${m}/${y}`;
}

window.addEventListener('resize', () => {
    Object.values(charts).forEach(c => c && c.resize && c.resize());
});

init();