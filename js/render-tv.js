import { db } from './firebase-config.js';
import { ref, onValue, update, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { iniciarRonda } from './logica.js';

const idSala = sessionStorage.getItem('idSala');
const nombreSalaDOM = document.getElementById('nombre-sala');
const rondaActualDOM = document.getElementById('ronda-actual');
const mesaCentro = document.getElementById('mesa-centro');
const mensajeEstado = document.getElementById('mensaje-estado');
const listaJugadores = document.getElementById('lista-jugadores');

// Modales TV
const modalHistorialTV = document.getElementById('modal-historial-tv');
const tablaHistorialTV = document.getElementById('tabla-historial-tv');
const btnCerrarHistorialTV = document.getElementById('btn-cerrar-historial-tv');
const btnHistorialTV = document.getElementById('btn-historial-tv');
const modalReglasTV = document.getElementById('modal-reglas-tv');
const btnReglasTV = document.getElementById('btn-reglas-tv');
const btnCerrarReglasTV = document.getElementById('btn-cerrar-reglas-tv');

let dataGlobal = null;

if (!idSala) {
    document.body.innerHTML = '<h1 style="color:red; text-align:center; margin-top:40vh;">Sin sala activa. Escanea el QR desde el inicio.</h1>';
    throw new Error("Sin sala");
}

const salaRef = ref(db, `calavera_rey/salas/${idSala}`);

// Si la TV se cierra o pierde conexión, los celulares cambian automáticamente a "Modo sin TV"
onDisconnect(salaRef).update({ tieneTableroTV: false });

// Marcar que hay TV activa al cargar
update(salaRef, { tieneTableroTV: true });

// ─── BOTONES MODALES ──────────────────────────────────────────────────────────

btnReglasTV.onclick = () => {
    modalReglasTV.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
};
btnCerrarReglasTV.onclick = () => { modalReglasTV.style.display = 'none'; };

btnHistorialTV.onclick = () => {
    if (!dataGlobal) return;
    renderizarHistorialTV();
    modalHistorialTV.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
};
btnCerrarHistorialTV.onclick = () => { modalHistorialTV.style.display = 'none'; };

// ─── HISTORIAL TV ─────────────────────────────────────────────────────────────

function renderizarHistorialTV() {
    const historial = dataGlobal?.historial || {};
    const rondasOrdenadas = Object.values(historial).sort((a, b) => a.ronda - b.ronda);
    const nombresJugadores = dataGlobal?.orden_jugadores || (dataGlobal?.jugadores ? Object.keys(dataGlobal.jugadores) : []);

    if (rondasOrdenadas.length === 0) {
        tablaHistorialTV.innerHTML = '<p style="color:#8899aa; text-align:center; padding:20px 0;">Aún no hay rondas completadas.</p>';
        return;
    }

    let html = `<table style="width:100%; border-collapse:collapse; font-size:0.95rem;">
        <thead>
            <tr style="border-bottom:2px solid var(--gold-dim);">
                <th style="text-align:left; padding:8px 6px; color:var(--gold);">Ronda</th>
                ${nombresJugadores.map(n => `<th style="text-align:center; padding:8px 6px; color:var(--gold);">${n}</th>`).join('')}
            </tr>
        </thead>
        <tbody>`;

    rondasOrdenadas.forEach(r => {
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
            <td style="padding:8px 6px; color:#aabbcc; font-weight:bold;">R${r.ronda}</td>
            ${nombresJugadores.map(n => {
                const res = r.resultados?.[n];
                if (!res) return `<td style="text-align:center; padding:8px 6px; color:#555;">-</td>`;
                const color = res.puntosRonda >= 0 ? '#00ffaa' : '#ff4444';
                const signo = res.puntosRonda >= 0 ? '+' : '';
                return `<td style="text-align:center; padding:8px 6px;">
                    <span style="color:${color}; font-weight:bold; font-size:1rem;">${signo}${res.puntosRonda}</span>
                    <div style="font-size:0.7rem; color:#8899aa;">${res.apuesta}/${res.bazasGanadas}${res.bonos ? ` +${res.bonos}b` : ''}</div>
                </td>`;
            }).join('')}
        </tr>`;
    });

    // Fila de totales
    html += `<tr style="border-top:2px solid var(--gold-dim); background:rgba(212,175,55,0.07);">
        <td style="padding:8px 6px; color:var(--gold); font-weight:bold;">TOTAL</td>
        ${nombresJugadores.map(n => {
            const pts = dataGlobal.jugadores?.[n]?.puntos || 0;
            return `<td style="text-align:center; padding:8px 6px; color:var(--gold); font-weight:bold; font-size:1.1rem;">${pts}</td>`;
        }).join('')}
    </tr>`;

    html += `</tbody></table>`;
    tablaHistorialTV.innerHTML = html;
}

// ─── ICONOS Y CLASES ─────────────────────────────────────────────────────────

const iconos = {
    'verde': 'bird', 'amarillo': 'coins', 'morado': 'map', 'negro': 'flag',
    'pirata': 'swords', 'sirena': 'waves', 'huida': 'flag-triangle-right',
    'skullking': 'skull', 'tigresa': 'cat', 'kraken': 'zap', 'ballena': 'anchor'
};

function obtenerClaseCSS(carta) {
    if (carta.tipo === 'numero') return `color-${carta.color}`;
    return `especial-${carta.tipo}`;
}

function obtenerTextoEsquina(carta) {
    if (carta.tipo === 'numero') return carta.valor;
    const map = { pirata:'P', sirena:'S', huida:'H', skullking:'SK', kraken:'K', ballena:'B', tigresa:'T' };
    return map[carta.tipo] || '';
}

// ─── LISTENER PRINCIPAL ───────────────────────────────────────────────────────

onValue(salaRef, (snapshot) => {
    dataGlobal = snapshot.val();
    if (!dataGlobal) return;

    nombreSalaDOM.innerText = idSala.toUpperCase();
    rondaActualDOM.innerText = dataGlobal.ronda || 1;

    const jugadoresObj = dataGlobal.jugadores || {};
    const jugadoresArray = Object.values(jugadoresObj);
    const nombresJugadores = dataGlobal.orden_jugadores || Object.keys(jugadoresObj);
    const baza = dataGlobal.baza_actual || [];

    // ── FOOTER: STATS DE JUGADORES ──
    listaJugadores.innerHTML = '';
    nombresJugadores.forEach(nombre => {
        const j = jugadoresObj[nombre];
        if (!j) return;
        const esTurno = dataGlobal.turno_actual === nombre;
        const card = document.createElement('div');
        card.className = 'jugador-card';
        if (esTurno) {
            card.style.borderColor = 'var(--gold)';
            card.style.boxShadow = '0 0 20px rgba(212,175,55,0.5)';
        }
        card.innerHTML = `
            <h3>${nombre}</h3>
            <div class="jugador-stats">
                <span>Puntos</span>
                <strong>${j.puntos || 0}</strong>
            </div>
            <div class="jugador-stats">
                <span>Apuesta</span>
                <strong>${j.apuesta >= 0 ? j.apuesta : '?'}</strong>
            </div>
            <div class="jugador-stats">
                <span>Bazas</span>
                <strong>${j.bazasGanadas || 0}</strong>
            </div>`;
        listaJugadores.appendChild(card);
    });

    // ── MESA CENTRAL ──
    // Limpiar mesa (mantener solo mensaje-estado si existe)
    while (mesaCentro.firstChild) mesaCentro.removeChild(mesaCentro.firstChild);

    if (dataGlobal.estado === 'esperando') {
        const msg = document.createElement('div');
        msg.className = 'mensaje-estado';
        msg.innerText = 'Esperando a la tripulación...';
        mesaCentro.appendChild(msg);

    } else if (dataGlobal.estado === 'apuestas') {
        const msg = document.createElement('div');
        msg.className = 'mensaje-estado';
        const faltanApostar = nombresJugadores.filter(n => jugadoresObj[n]?.apuesta === -1);
        if (faltanApostar.length > 0) {
            msg.innerHTML = `<span style="font-size:1.2rem;">Apostando...</span><br><span style="font-size:0.8em; color:#8899aa;">Faltan: ${faltanApostar.join(', ')}</span>`;
        } else {
            msg.innerText = '¡Todos apostaron! Iniciando...';
            // Transición automática a jugando si todos apostaron
            if (dataGlobal.host) {
                update(salaRef, { estado: 'jugando' });
            }
        }
        mesaCentro.appendChild(msg);

    } else if (dataGlobal.estado === 'jugando') {
        if (baza.length === 0) {
            const msg = document.createElement('div');
            msg.className = 'mensaje-estado';
            if (dataGlobal.ultimo_ganador) {
                msg.innerHTML = `<span style="color:#00ffaa;"><i data-lucide="anchor" style="width:1em;height:1em;vertical-align:middle;"></i> ¡${dataGlobal.ultimo_ganador} ganó la baza!</span>`;
            } else {
                msg.innerHTML = `Turno de: <strong style="color:var(--gold);">${dataGlobal.turno_actual || '---'}</strong>`;
            }
            mesaCentro.appendChild(msg);
        } else {
            baza.forEach(carta => {
                const divCarta = document.createElement('div');
                // BUG B FIX: si es Tigresa mutada, usar clase visual de tigresa (no pirata/huida)
                const claseVisual = carta.esTigresa ? 'especial-tigresa' : obtenerClaseCSS(carta);
                divCarta.className = `carta-pirata ${claseVisual}`;
                divCarta.style.margin = '0 10px';

                // BUG B FIX: mostrar icono y texto de Tigresa aunque el tipo sea pirata/huida
                const textoEsquina = carta.esTigresa ? 'T' : obtenerTextoEsquina(carta);
                const iconoCentro = carta.esTigresa ? iconos['tigresa'] : (carta.tipo === 'numero' ? iconos[carta.color] : iconos[carta.tipo]);

                divCarta.innerHTML = `
                    <div class="carta-esquina">${textoEsquina}</div>
                    <div class="carta-centro"><i data-lucide="${iconoCentro}"></i></div>
                    <div class="carta-esquina invertida">${textoEsquina}</div>
                    <div style="font-size:0.6rem; text-align:center; color:rgba(255,255,255,0.7); margin-top:4px; position:absolute; bottom:6px; left:0; right:0;">${carta.jugadoPor}</div>`;

                mesaCentro.appendChild(divCarta);
            });
        }

    } else if (dataGlobal.estado === 'fin_ronda') {
        const msg = document.createElement('div');
        msg.className = 'mensaje-estado';
        msg.innerHTML = `<span style="color:var(--gold);"><i data-lucide="flag" style="width:1em;height:1em;vertical-align:middle;"></i> ¡Ronda ${dataGlobal.ronda} terminada!</span><br><span style="font-size:0.7em; color:#8899aa;">Esperando confirmación de jugadores...</span>`;
        mesaCentro.appendChild(msg);

    } else if (dataGlobal.estado === 'fin_juego') {
        const ranking = [...jugadoresArray].sort((a, b) => (b.puntos || 0) - (a.puntos || 0));
        const msg = document.createElement('div');
        msg.className = 'mensaje-estado';
        msg.style.flexDirection = 'column';
        msg.style.gap = '10px';
        msg.innerHTML = `
            <span style="font-size:1.5em; color:var(--gold);"><i data-lucide="trophy" style="width:1em;height:1em;vertical-align:middle;"></i> ¡FIN DEL JUEGO!</span>
            <span style="color:#00ffaa; font-size:1.2em;">Capitán: ${ranking[0]?.nombre || '---'}</span>
            <div style="font-size:0.75em; color:#aabbcc;">
                ${ranking.map((j, i) => `${i + 1}. ${j.nombre} — ${j.puntos || 0} pts`).join(' &nbsp;|&nbsp; ')}
            </div>`;
        mesaCentro.appendChild(msg);
    }

    if (window.lucide) window.lucide.createIcons();
});
