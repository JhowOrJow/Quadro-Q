const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const DB_PATH = path.join(__dirname, 'db.json');

const DB_DEFAULT = {
    registros: [],
    diario: [],
    revisoes: []
};

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DB_DEFAULT, null, 2));
} else {
    const existing = JSON.parse(fs.readFileSync(DB_PATH));
    if (!existing.diario) { existing.diario = []; fs.writeFileSync(DB_PATH, JSON.stringify(existing, null, 2)); }
    if (!existing.revisoes) { existing.revisoes = []; fs.writeFileSync(DB_PATH, JSON.stringify(existing, null, 2)); }
}

// Turnos: 1° 06:15-14:15, 2° 14:15-22:15, 3° 22:15-06:15
function calcularTurno(timestamp) {
    const d = timestamp ? new Date(timestamp) : new Date();
    const totalMin = d.getHours() * 60 + d.getMinutes();
    const t1Start = 6 * 60 + 15;   // 375
    const t1End   = 14 * 60 + 15;  // 855
    const t2End   = 22 * 60 + 15;  // 1335
    if (totalMin >= t1Start && totalMin < t1End) return "1° Turno";
    if (totalMin >= t1End   && totalMin < t2End) return "2° Turno";
    return "3° Turno";
}

function lerDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function salvarDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/* ─── REGISTROS ─── */
app.get('/api/registros', (req, res) => {
    const db = lerDB();
    let registros = db.registros;
    // Filtros opcionais por query
    if (req.query.ano)   registros = registros.filter(r => new Date(r.timestamp).getFullYear() == req.query.ano);
    if (req.query.mes)   registros = registros.filter(r => (new Date(r.timestamp).getMonth() + 1) == req.query.mes);
    if (req.query.setor) registros = registros.filter(r => r.setor === req.query.setor);
    res.json(registros);
});

app.post('/api/registros', (req, res) => {
    const db = lerDB();
    const agora = new Date().toISOString();
    const novo = {
        id: Date.now(),
        timestamp: agora,
        turno: calcularTurno(),
        ...req.body
    };
    db.registros.push(novo);
    salvarDB(db);
    res.json(novo);
});

app.delete('/api/registros/:id', (req, res) => {
    const db = lerDB();
    db.registros = db.registros.filter(r => r.id != req.params.id);
    salvarDB(db);
    res.json({ ok: true });
});

/* ─── DIÁRIO DE BORDO ─── */
app.get('/api/diario', (req, res) => {
    const db = lerDB();
    let diario = db.diario || [];
    if (req.query.data) diario = diario.filter(d => d.dataCal === req.query.data);
    res.json(diario);
});

app.post('/api/diario', (req, res) => {
    const db = lerDB();
    const novo = { id: Date.now(), timestamp: new Date().toISOString(), turno: calcularTurno(), ...req.body };
    if (!db.diario) db.diario = [];
    db.diario.push(novo);
    salvarDB(db);
    res.json(novo);
});

/* ─── ANALYTICS AGREGADOS ─── */
app.get('/api/analytics/resumo', (req, res) => {
    const db = lerDB();
    const registros = db.registros;

    const total = registros.filter(r => r.cor !== 'green').length;

    const porSetor = {};
    const porLinha = {};
    const porTurno = { "1° Turno": 0, "2° Turno": 0, "3° Turno": 0 };
    const porCliente = {};
    const porProduto = {};
    const porMes = {};
    const porAno = {};
    const porCor = { red: 0, yellow: 0, green: 0 };

    registros.forEach(r => {
        const d = new Date(r.timestamp);
        const ano = d.getFullYear();
        const mes = `${ano}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const semana = `${ano}-S${String(Math.ceil(d.getDate()/7)).padStart(2,'0')}`;

        if (r.cor !== 'green') {
            if (r.setor)    porSetor[r.setor]       = (porSetor[r.setor] || 0) + 1;
            if (r.maquina)  porLinha[r.maquina]      = (porLinha[r.maquina] || 0) + 1;
            if (r.turno)    porTurno[r.turno]         = (porTurno[r.turno] || 0) + 1;
            if (r.cliente)  porCliente[r.cliente]     = (porCliente[r.cliente] || 0) + 1;
            if (r.produto)  porProduto[r.produto]     = (porProduto[r.produto] || 0) + 1;
            porMes[mes]  = (porMes[mes] || 0) + 1;
            porAno[ano]  = (porAno[ano] || 0) + 1;
        }
        if (r.cor) porCor[r.cor] = (porCor[r.cor] || 0) + 1;
    });

    res.json({ total, porSetor, porLinha, porTurno, porCliente, porProduto, porMes, porAno, porCor });
});

app.get('/api/analytics/tendencia', (req, res) => {
    const db = lerDB();
    const ano = req.query.ano || new Date().getFullYear();
    const mes = req.query.mes || (new Date().getMonth() + 1);

    const registros = db.registros.filter(r => {
        const d = new Date(r.timestamp);
        return d.getFullYear() == ano && (d.getMonth() + 1) == mes && r.cor !== 'green';
    });

    const diasNoMes = new Date(ano, mes, 0).getDate();
    const dias = Array.from({ length: diasNoMes }, (_, i) => {
        const dStr = `${ano}-${String(mes).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
        return {
            dia: i + 1,
            data: dStr,
            total: registros.filter(r => r.dataCal === dStr).length,
            red: registros.filter(r => r.dataCal === dStr && r.cor === 'red').length,
            yellow: registros.filter(r => r.dataCal === dStr && r.cor === 'yellow').length
        };
    });

    res.json(dias);
});

app.get('/api/analytics/drilldown', (req, res) => {
    const db = lerDB();
    const { nivel, valor, ano, mes } = req.query;
    let registros = db.registros.filter(r => r.cor !== 'green');

    if (ano) registros = registros.filter(r => new Date(r.timestamp).getFullYear() == ano);
    if (mes) registros = registros.filter(r => (new Date(r.timestamp).getMonth() + 1) == mes);

    let resultado = {};
    if (nivel === 'setor') {
        registros.filter(r => r.setor === valor).forEach(r => {
            resultado[r.maquina] = (resultado[r.maquina] || 0) + 1;
        });
    } else if (nivel === 'maquina') {
        registros.filter(r => r.maquina === valor).forEach(r => {
            resultado[r.motivo || 'Sem motivo'] = (resultado[r.motivo || 'Sem motivo'] || 0) + 1;
        });
    }

    res.json(resultado);
});

app.listen(3000, () => console.log('QualityNCF v4.0 → http://localhost:3000'));