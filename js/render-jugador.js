import { db } from './firebase-config.js';
import { ref, onValue, update, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { iniciarRonda, procesarFinDeBaza } from './logica.js';

const nombreUsuario = sessionStorage.getItem('usuarioNombre');
const idSala = sessionStorage.getItem('idSala');

if (!nombreUsuario || !idSala) {
    window.location.replace('index.html');
    throw new Error("Acceso denegado: Redirigiendo al inicio.");
}

const salaRef = ref(db, `calavera_rey/salas/${idSala}`);
const miRef = ref(db, `calavera_rey/salas/${idSala}/jugadores/${nombreUsuario}`);

// BUG D FIX: solo eliminar al jugador en desconexión si está en el lobby (esperando).
// Durante la partida, solo marcar como desconectado para no destruir su mano/puntos.
// La lógica de reconexión se maneja al volver a cargar jugador.html.
onDisconnect(miRef).update({ conectado: false });

const iconWait = `<i data-lucide="clock" style="vertical-align: middle; width: 1.2em; height: 1.2em;"></i>`;

document.getElementById('nombre-mi-pirata').innerText = nombreUsuario.toUpperCase();

// Referencias DOM
const txtApuesta = document.getElementById('mi-apuesta');
const txtBazas = document.getElementById('mis-bazas');
const modalApuestas = document.getElementById('pantalla-apuestas');
const contenedorBotonesApuesta = document.getElementById('botones-apuesta');
const lobbyEspera = document.getElementById('lobby-espera');
const btnListo = document.getElementById('btn-listo');
const btnZarpar = document.getElementById('btn-zarpar');
const miManoDOM = document.getElementById('mi-mano');
const mesaCelular = document.getElementById('mesa-celular');
const mesaCelularCentro = document.getElementById('mesa-celular-centro');
const modalPuntos = document.getElementById('modal-puntuacion');
const btnPuntos = document.getElementById('btn-puntos');
const btnCerrarPuntos = document.getElementById('btn-cerrar-puntos');
const listaPuntos = document.getElementById('lista-puntos-celular');
const tablaHistorial = document.getElementById('tabla-historial');
const modalFinRonda = document.getElementById('modal-fin-ronda');
const btnSiguienteRonda = document.getElementById('btn-siguiente-ronda');
const btnZarparSiguiente = document.getElementById('btn-zarpar-siguiente');
const resumenRonda = document.getElementById('resumen-ronda');
const faltanConfirmar = document.getElementById('faltan-confirmar');
const modalFinJuego = document.getElementById('modal-fin-juego');
const ganadorFinal = document.getElementById('ganador-final');
const rankingFinal = document.getElementById('ranking-final');
const btnVolverLobby = document.getElementById('btn-volver-lobby');
const selectorRondas = document.getElementById('selector-rondas');
const btn5Rondas = document.getElementById('btn-5-rondas');
const btn10Rondas = document.getElementById('btn-10-rondas');
const quienInicia = document.getElementById('quien-inicia');
const rondaApuesta = document.getElementById('ronda-apuesta');
const previewMano = document.getElementById('preview-mano');
const modalReglas = document.getElementById('modal-reglas');
const btnReglas = document.getElementById('btn-reglas');
const btnCerrarReglas = document.getElementById('btn-cerrar-reglas');
const btnPuntosFlotante = document.getElementById('btn-puntos-flotante');

let dataGlobal = null;
let maxRondasSeleccionadas = 10;

// ─── SISTEMA DE TOASTS (estilo Sonner) ───────────────────────────────────────

(function crearContenedorToasts() {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column-reverse;
        gap: 8px;
        z-index: 9999;
        pointer-events: none;
        width: 90%;
        max-width: 360px;
    `;
    document.body.appendChild(c);
})();

function mostrarToast(mensaje, tipo = 'info', duracion = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    const colores = {
        info:    { bg: 'rgba(20,30,50,0.97)', border: 'var(--gold-dim)',  icon: '⚓' },
        error:   { bg: 'rgba(80,10,10,0.97)',  border: '#ff4444',         icon: '🚫' },
        success: { bg: 'rgba(10,50,30,0.97)',  border: '#00ffaa',         icon: '✅' },
        warning: { bg: 'rgba(60,40,0,0.97)',   border: '#ffdd44',         icon: '⚠️' },
    };
    const col = colores[tipo] || colores.info;

    toast.style.cssText = `
        background: ${col.bg};
        border: 1px solid ${col.border};
        border-radius: 12px;
        padding: 12px 16px;
        color: #e8e8e8;
        font-size: 0.9rem;
        line-height: 1.4;
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        cursor: pointer;
    `;
    toast.innerHTML = `<span style="font-size:1.2rem;flex-shrink:0;">${col.icon}</span><span>${mensaje}</span>`;
    toast.onclick = () => cerrarToast(toast);

    container.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
    });

    const timer = setTimeout(() => cerrarToast(toast), duracion);
    toast._timer = timer;
}

function cerrarToast(toast) {
    clearTimeout(toast._timer);
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(16px)';
    setTimeout(() => toast.remove(), 280);
}

/**
 * Diálogo de confirmación estilo Sonner (reemplaza confirm())
 * @returns {Promise<boolean>}
 */
function mostrarConfirm(mensaje, txtAceptar = 'Sí', txtCancelar = 'No') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.75);
            backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            z-index: 9998;
        `;

        const card = document.createElement('div');
        card.style.cssText = `
            background: rgba(15,25,40,0.98);
            border: 1px solid var(--gold-dim);
            border-radius: 16px;
            padding: 24px 20px;
            width: 88%;
            max-width: 320px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
        `;
        card.innerHTML = `
            <p style="color:var(--parchment); font-size:1rem; line-height:1.5; margin-bottom:20px;">${mensaje}</p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button id="confirm-si" style="flex:1; padding:12px; background:var(--gold); color:black; border:none; border-radius:10px; font-weight:bold; font-size:0.95rem; cursor:pointer;">${txtAceptar}</button>
                <button id="confirm-no" style="flex:1; padding:12px; background:rgba(255,255,255,0.08); color:#ccc; border:1px solid #444; border-radius:10px; font-size:0.95rem; cursor:pointer;">${txtCancelar}</button>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        card.querySelector('#confirm-si').onclick = () => { overlay.remove(); resolve(true); };
        card.querySelector('#confirm-no').onclick = () => { overlay.remove(); resolve(false); };
    });
}

// ─── EVENT LISTENERS ESTÁTICOS ───────────────────────────────────────────────

btn5Rondas.onclick = () => {
    maxRondasSeleccionadas = 5;
    btn5Rondas.classList.add('activo');
    btn10Rondas.classList.remove('activo');
    update(salaRef, { max_rondas: 5 });
};

btn10Rondas.onclick = () => {
    maxRondasSeleccionadas = 10;
    btn10Rondas.classList.add('activo');
    btn5Rondas.classList.remove('activo');
    update(salaRef, { max_rondas: 10 });
};

btnListo.onclick = async () => {
    await update(miRef, { listo: true });
    btnListo.innerText = "¡PREPARADO!";
    btnListo.disabled = true;
    btnListo.style.opacity = "0.5";
};

btnZarpar.onclick = () => iniciarRonda(idSala);

// Reglas
btnReglas.onclick = () => { modalReglas.style.display = 'flex'; };
btnCerrarReglas.onclick = () => { modalReglas.style.display = 'none'; };

// ─── MODAL DE PUNTOS ─────────────────────────────────────────────────────────

function abrirModalPuntos(irAHistorial = false) {
    if (!dataGlobal || !dataGlobal.jugadores) return;

    // Vista totales
    const jArr = Object.values(dataGlobal.jugadores).sort((a, b) => (b.puntos || 0) - (a.puntos || 0));
    listaPuntos.innerHTML = jArr.map(j =>
        `<div class="puntuacion-item">
            <span>${j.nombre}</span>
            <strong style="color:var(--gold)">${j.puntos || 0} pts</strong>
        </div>`
    ).join('');

    // Vista historial
    const historial = dataGlobal.historial || {};
    const rondasOrdenadas = Object.values(historial).sort((a, b) => a.ronda - b.ronda);
    const nombresJugadores = dataGlobal.orden_jugadores || Object.keys(dataGlobal.jugadores);

    if (rondasOrdenadas.length === 0) {
        tablaHistorial.innerHTML = '<p style="color:#8899aa; text-align:center; padding:20px 0;">Aún no hay rondas completadas.</p>';
    } else {
        let html = `<table style="width:100%; border-collapse:collapse; min-width:200px;">
            <thead>
                <tr style="border-bottom: 1px solid var(--gold-dim);">
                    <th style="text-align:left; padding:6px 4px; color:var(--gold); font-size:0.8rem;">Ronda</th>
                    ${nombresJugadores.map(n => `<th style="text-align:center; padding:6px 4px; color:var(--gold); font-size:0.75rem;">${n}</th>`).join('')}
                </tr>
            </thead>
            <tbody>`;

        rondasOrdenadas.forEach(r => {
            html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding:6px 4px; color:#aabbcc; font-size:0.8rem; white-space:nowrap;">R${r.ronda}</td>
                ${nombresJugadores.map(n => {
                    const res = r.resultados?.[n];
                    if (!res) return `<td style="text-align:center; padding:6px 4px; color:#555;">-</td>`;
                    const color = res.puntosRonda >= 0 ? '#00ffaa' : '#ff4444';
                    const signo = res.puntosRonda >= 0 ? '+' : '';
                    return `<td style="text-align:center; padding:6px 4px;">
                        <span style="color:${color}; font-weight:bold; font-size:0.85rem;">${signo}${res.puntosRonda}</span>
                        <div style="font-size:0.65rem; color:#8899aa;">${res.apuesta}/${res.bazasGanadas}</div>
                    </td>`;
                }).join('')}
            </tr>`;
        });

        html += `<tr style="border-top: 2px solid var(--gold-dim); background:rgba(212,175,55,0.05);">
            <td style="padding:6px 4px; color:var(--gold); font-size:0.8rem; font-weight:bold;">Total</td>
            ${nombresJugadores.map(n => {
                const pts = dataGlobal.jugadores[n]?.puntos || 0;
                return `<td style="text-align:center; padding:6px 4px; color:var(--gold); font-weight:bold; font-size:0.85rem;">${pts}</td>`;
            }).join('')}
        </tr>`;

        html += `</tbody></table>`;
        tablaHistorial.innerHTML = html;
    }

    // Decidir qué pestaña mostrar
    if (irAHistorial) {
        document.getElementById('vista-totales').style.display = 'none';
        document.getElementById('vista-historial').style.display = 'block';
        document.getElementById('tab-totales').classList.remove('activo');
        document.getElementById('tab-historial').classList.add('activo');
    } else {
        document.getElementById('vista-totales').style.display = 'block';
        document.getElementById('vista-historial').style.display = 'none';
        document.getElementById('tab-totales').classList.add('activo');
        document.getElementById('tab-historial').classList.remove('activo');
    }

    // Elevar z-index para que quede sobre cualquier otro modal
    modalPuntos.style.zIndex = '600';
    modalPuntos.style.display = 'flex';
}

btnPuntos.onclick = () => abrirModalPuntos(false);
btnPuntosFlotante.onclick = () => abrirModalPuntos(false);

btnCerrarPuntos.onclick = () => {
    modalPuntos.style.display = 'none';
    modalPuntos.style.zIndex = '';
};

// Pestañas del modal de puntos
document.getElementById('tab-totales').onclick = () => {
    document.getElementById('vista-totales').style.display = 'block';
    document.getElementById('vista-historial').style.display = 'none';
    document.getElementById('tab-totales').classList.add('activo');
    document.getElementById('tab-historial').classList.remove('activo');
};

document.getElementById('tab-historial').onclick = () => {
    document.getElementById('vista-totales').style.display = 'none';
    document.getElementById('vista-historial').style.display = 'block';
    document.getElementById('tab-historial').classList.add('activo');
    document.getElementById('tab-totales').classList.remove('activo');
};

// Botón historial en pantalla de fin de juego — abre directo en pestaña historial
document.getElementById('btn-historial-fin').onclick = () => abrirModalPuntos(true);

// Volver al lobby (reiniciar juego) — FIX: rutas separadas por jugador
btnVolverLobby.onclick = async () => {
    if (!dataGlobal || !dataGlobal.jugadores) return;
    const nombresJugadores = dataGlobal.orden_jugadores || Object.keys(dataGlobal.jugadores);

    // 1. Ocultar el modal inmediatamente para feedback visual
    modalFinJuego.style.display = 'none';

    // 2. Resetear datos de sala
    await update(salaRef, {
        estado: 'esperando',
        ronda: 1,
        baza_actual: null,
        repartidor_index: 0,
        procesando_baza: null,
        ultimo_ganador: null,
        historial: null,
        orden_jugadores: null,
        turno_actual: null
    });

    // 3. Resetear cada jugador por separado
    for (const n of nombresJugadores) {
        const jugRef = ref(db, `calavera_rey/salas/${idSala}/jugadores/${n}`);
        await update(jugRef, {
            puntos: 0,
            listo: false,
            listo_siguiente: false,
            mano: null,
            apuesta: -1,
            bazasGanadas: 0,
            bonos_temp: 0
        });
    }
};

// ─── LISTENER PRINCIPAL DE FIREBASE ──────────────────────────────────────────

onValue(salaRef, (snapshot) => {
    dataGlobal = snapshot.val();

    if (!dataGlobal || !dataGlobal.jugadores || !dataGlobal.jugadores[nombreUsuario]) {
        sessionStorage.clear();
        window.location.replace('index.html');
        return;
    }

    const misDatos = dataGlobal.jugadores[nombreUsuario];
    const isHost = dataGlobal.host === nombreUsuario;
    const jugadoresArray = Object.values(dataGlobal.jugadores);
    const nombresJugadores = dataGlobal.orden_jugadores || Object.keys(dataGlobal.jugadores);

    txtBazas.innerText = misDatos.bazasGanadas || 0;

    // ── ESTADO: ESPERANDO ──
    if (dataGlobal.estado === 'esperando') {
        lobbyEspera.style.display = 'flex';
        modalApuestas.style.display = 'none';
        modalFinRonda.style.display = 'none';
        modalFinJuego.style.display = 'none';   // FIX: ocultar pantalla de fin de juego
        mesaCelular.style.display = 'none';
        btnPuntosFlotante.style.display = 'none';

        // Resetear botón listo para nueva partida
        btnListo.innerText = "¡ESTOY LISTO!";
        btnListo.disabled = false;
        btnListo.style.opacity = "1";

        const maxRondasActual = dataGlobal.max_rondas || 10;
        if (maxRondasActual === 5) {
            btn5Rondas.classList.add('activo');
            btn10Rondas.classList.remove('activo');
        } else {
            btn10Rondas.classList.add('activo');
            btn5Rondas.classList.remove('activo');
        }

        if (isHost) {
            selectorRondas.style.display = 'block';
            btnZarpar.style.display = 'block';
            const todosListos = jugadoresArray.every(j => j.listo);

            if (jugadoresArray.length >= 2 && todosListos) {
                btnZarpar.disabled = false;
                btnZarpar.style.background = "var(--gold)";
                btnZarpar.innerText = "¡ZARPAR!";
            } else {
                btnZarpar.disabled = true;
                btnZarpar.style.background = "gray";
                btnZarpar.innerText = "Faltan marineros o no están listos...";
            }
        } else {
            selectorRondas.style.display = 'none';
        }
    }

    // ── ESTADO: APUESTAS ──
    else if (dataGlobal.estado === 'apuestas') {
        lobbyEspera.style.display = 'none';
        modalFinRonda.style.display = 'none';
        mesaCelular.style.display = 'none';
        btnPuntosFlotante.style.display = 'none';

        if (misDatos.apuesta === -1) {
            txtApuesta.innerHTML = iconWait;
            mostrarModalApuestas(dataGlobal.ronda);
        } else {
            txtApuesta.innerText = misDatos.apuesta;
            modalApuestas.style.display = 'none';
        }

        if (!dataGlobal.tieneTableroTV) {
            const todosApostaron = jugadoresArray.every(j => j.apuesta !== -1);
            // UX FIX: cualquier jugador puede detonar la transición (no solo el host),
            // así si el host pierde internet en fase de apuestas la partida no se congela.
            if (todosApostaron) {
                update(salaRef, { estado: 'jugando' });
            }
        }
    }

    // ── ESTADO: JUGANDO ──
    else if (dataGlobal.estado === 'jugando') {
        lobbyEspera.style.display = 'none';
        modalApuestas.style.display = 'none';
        modalFinRonda.style.display = 'none';
        txtApuesta.innerText = misDatos.apuesta;

        if (!dataGlobal.tieneTableroTV) {
            mesaCelular.style.display = 'flex';
            renderizarMesaCelular(dataGlobal.baza_actual || []);

            const yaTire = (dataGlobal.baza_actual || []).some(c => c.jugadoPor === nombreUsuario);
            if (yaTire) {
                btnPuntosFlotante.style.display = 'flex';
            } else {
                btnPuntosFlotante.style.display = 'none';
            }
        } else {
            mesaCelular.style.display = 'none';
            btnPuntosFlotante.style.display = 'none';
        }

        const topbar = document.querySelector('.jugador-topbar');
        if (dataGlobal.turno_actual === nombreUsuario) {
            topbar.style.borderColor = 'var(--gold)';
            topbar.style.boxShadow = '0 0 20px rgba(212, 175, 55, 0.5)';
        } else {
            topbar.style.borderColor = 'var(--gold-dim)';
            topbar.style.boxShadow = '';
        }
    }

    // ── ESTADO: FIN DE RONDA ──
    else if (dataGlobal.estado === 'fin_ronda') {
        lobbyEspera.style.display = 'none';
        modalApuestas.style.display = 'none';
        modalFinRonda.style.display = 'flex';
        mesaCelular.style.display = 'none';
        btnPuntosFlotante.style.display = 'none';

        const ranking = [...jugadoresArray].sort((a, b) => (b.puntos || 0) - (a.puntos || 0));
        const rondaActual = dataGlobal.ronda;
        const historialRonda = dataGlobal.historial?.[`ronda_${rondaActual}`]?.resultados || {};

        resumenRonda.innerHTML = ranking.map(j => {
            const res = historialRonda[j.nombre] || {};
            const puntosRonda = res.puntosRonda ?? null;
            const colorPuntos = puntosRonda !== null ? (puntosRonda >= 0 ? '#00ffaa' : '#ff4444') : '#aabbcc';
            const signo = puntosRonda !== null && puntosRonda >= 0 ? '+' : '';
            return `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding:8px 0;">
                <div>
                    <span style="font-weight:bold;">${j.nombre}</span>
                    <div style="font-size:0.75rem; color:#8899aa; margin-top:2px;">
                        Apuesta: <strong style="color:#aabbcc;">${res.apuesta ?? '?'}</strong>
                        &nbsp;|&nbsp; Ganadas: <strong style="color:#aabbcc;">${res.bazasGanadas ?? '?'}</strong>
                        ${res.bonos ? `&nbsp;|&nbsp; Bonos: <strong style="color:var(--gold);">+${res.bonos}</strong>` : ''}
                    </div>
                </div>
                <div style="text-align:right;">
                    <strong style="color:${colorPuntos}; font-size:1rem;">${puntosRonda !== null ? signo + puntosRonda : '?'}</strong>
                    <div style="font-size:0.75rem; color:#aabbcc;">Total: ${j.puntos || 0}</div>
                </div>
            </div>`;
        }).join('');

        if (misDatos.listo_siguiente) {
            btnSiguienteRonda.style.display = 'none';
        } else {
            btnSiguienteRonda.style.display = 'block';
            btnSiguienteRonda.onclick = () => update(miRef, { listo_siguiente: true });
        }

        const faltan = nombresJugadores.filter(n => !dataGlobal.jugadores[n].listo_siguiente);
        faltanConfirmar.innerText = faltan.length > 0 ? faltan.join(', ') : '¡Todos listos!';

        if (isHost) {
            btnZarparSiguiente.style.display = 'block';
            if (faltan.length === 0) {
                btnZarparSiguiente.disabled = false;
                btnZarparSiguiente.style.background = 'var(--gold)';
                btnZarparSiguiente.innerText = 'INICIAR RONDA ' + (dataGlobal.ronda + 1);
                btnZarparSiguiente.onclick = async () => {
                    await update(salaRef, { ronda: dataGlobal.ronda + 1 });
                    iniciarRonda(idSala);
                };
            } else {
                btnZarparSiguiente.disabled = true;
                btnZarparSiguiente.style.background = 'gray';
                btnZarparSiguiente.innerText = 'Esperando a la tripulación...';
            }
        }
    }

    // ── ESTADO: FIN DE JUEGO ──
    else if (dataGlobal.estado === 'fin_juego') {
        lobbyEspera.style.display = 'none';
        modalApuestas.style.display = 'none';
        modalFinRonda.style.display = 'none';
        mesaCelular.style.display = 'none';
        modalFinJuego.style.display = 'flex';
        btnPuntosFlotante.style.display = 'none';

        const ranking = [...jugadoresArray].sort((a, b) => (b.puntos || 0) - (a.puntos || 0));

        ganadorFinal.innerHTML = `<i data-lucide="crown" style="vertical-align: middle;"></i> ${ranking[0].nombre}`;

        rankingFinal.innerHTML = ranking.map((j, index) =>
            `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #444; padding:8px 0; ${index === 0 ? 'color:#00ffaa; font-weight:bold;' : ''}">
                <span>${index + 1}. ${j.nombre}</span>
                <strong>${j.puntos || 0} pts</strong>
            </div>`
        ).join('');

        if (isHost) {
            btnVolverLobby.style.display = 'block';
        }
    }

    // ── RENDERIZAR MANO ──
    if (misDatos.mano && dataGlobal.estado !== 'fin_ronda' && dataGlobal.estado !== 'fin_juego') {
        let deboOcultarMano = false;

        if (dataGlobal.estado === 'jugando' && !dataGlobal.tieneTableroTV) {
            const yaTire = (dataGlobal.baza_actual || []).some(c => c.jugadoPor === nombreUsuario);
            if (yaTire) {
                deboOcultarMano = true;
            }
        }

        if (deboOcultarMano) {
            miManoDOM.innerHTML = '';
        } else {
            renderizarMano(misDatos.mano);
        }
    } else {
        miManoDOM.innerHTML = '';
    }

    if (window.lucide) window.lucide.createIcons();
});

// ─── FUNCIONES DE RENDER ──────────────────────────────────────────────────────

function mostrarModalApuestas(ronda) {
    modalApuestas.style.display = 'flex';

    quienInicia.innerText = dataGlobal.turno_actual || '---';
    rondaApuesta.innerText = `${ronda} / ${dataGlobal.max_rondas || 10}`;

    previewMano.innerHTML = '';
    const miMano = dataGlobal.jugadores[nombreUsuario].mano || [];
    miMano.forEach(carta => {
        if (!carta) return;
        const divCarta = document.createElement('div');
        divCarta.className = `preview-carta-mini ${obtenerClaseCSS(carta)}`;
        const textoEsquina = obtenerTextoEsquina(carta);
        const iconoCentro = carta.tipo === 'numero' ? iconos[carta.color] : iconos[carta.tipo];
        divCarta.innerHTML = `
            <div class="carta-esquina">${textoEsquina}</div>
            <div class="carta-centro"><i data-lucide="${iconoCentro}"></i></div>`;
        previewMano.appendChild(divCarta);
    });

    contenedorBotonesApuesta.innerHTML = '';
    for (let i = 0; i <= ronda; i++) {
        const btn = document.createElement('button');
        btn.className = 'btn-apuesta';
        btn.innerText = i;
        btn.onclick = () => update(miRef, { apuesta: i });
        contenedorBotonesApuesta.appendChild(btn);
    }

    if (window.lucide) window.lucide.createIcons();
}

const iconos = {
    'verde': 'bird',
    'amarillo': 'coins',
    'morado': 'map',
    'negro': 'flag',
    'pirata': 'swords',
    'sirena': 'waves',
    'huida': 'flag-triangle-right',
    'skullking': 'skull',
    'tigresa': 'cat',
    'kraken': 'zap',
    'ballena': 'anchor'
};

function obtenerClaseCSS(carta) {
    if (carta.tipo === 'numero') return `color-${carta.color}`;
    return `especial-${carta.tipo}`;
}

function obtenerTextoEsquina(carta) {
    if (carta.tipo === 'numero') return carta.valor;
    if (carta.tipo === 'pirata') return 'P';
    if (carta.tipo === 'sirena') return 'S';
    if (carta.tipo === 'huida') return 'H';
    if (carta.tipo === 'skullking') return 'SK';
    if (carta.tipo === 'kraken') return 'K';
    if (carta.tipo === 'ballena') return 'B';
    if (carta.tipo === 'tigresa') return 'T';
    return '';
}

function renderizarMano(manoArray) {
    miManoDOM.innerHTML = '';

    manoArray.forEach((carta, index) => {
        if (!carta) return;

        const divCarta = document.createElement('div');
        divCarta.className = `carta-pirata ${obtenerClaseCSS(carta)}`;

        const textoEsquina = obtenerTextoEsquina(carta);
        const iconoCentro = carta.tipo === 'numero' ? iconos[carta.color] : iconos[carta.tipo];

        if (dataGlobal.turno_actual !== nombreUsuario) {
            divCarta.style.opacity = '0.5';
            divCarta.style.cursor = 'not-allowed';
        }

        divCarta.innerHTML = `
            <div class="carta-esquina">${textoEsquina}</div>
            <div class="carta-centro"><i data-lucide="${iconoCentro}"></i></div>
            <div class="carta-esquina invertida">${textoEsquina}</div>`;

        divCarta.onclick = () => tirarCarta(carta, index);
        miManoDOM.appendChild(divCarta);
    });
}

function renderizarMesaCelular(baza) {
    mesaCelularCentro.innerHTML = '';

    if (baza.length === 0) {
        if (dataGlobal.ultimo_ganador) {
            mesaCelularCentro.innerHTML = `
                <span style="color:#00ffaa; font-size:1rem; font-weight:bold;">
                    <i data-lucide="anchor" style="width:1em;height:1em;vertical-align:middle;"></i> ¡${dataGlobal.ultimo_ganador} ganó la baza!
                </span>`;
        } else {
            mesaCelularCentro.innerHTML = `
                <span style="color:gray; font-size:0.9rem;">
                    Turno de: <strong style="color:var(--gold)">${dataGlobal.turno_actual}</strong>
                </span>`;
        }
        return;
    }

    baza.forEach(carta => {
        const divCarta = document.createElement('div');
        divCarta.className = `carta-pirata mini-carta ${obtenerClaseCSS(carta)}`;
        divCarta.style.transform = `rotate(${Math.random() * 10 - 5}deg)`;

        const textoEsquina = obtenerTextoEsquina(carta);
        const iconoCentro = carta.tipo === 'numero' ? iconos[carta.color] : iconos[carta.tipo];

        divCarta.innerHTML = `
            <div class="carta-esquina">${textoEsquina}</div>
            <div class="carta-centro"><i data-lucide="${iconoCentro}"></i></div>
            <div style="font-size:0.55rem; text-align:center; color:rgba(255,255,255,0.7); margin-top:2px;">
                ${carta.jugadoPor}
            </div>`;

        mesaCelularCentro.appendChild(divCarta);
    });
}

// ─── TIRAR CARTA ─────────────────────────────────────────────────────────────

async function tirarCarta(carta, index) {
    if (!dataGlobal || dataGlobal.estado !== 'jugando') return;
    if (dataGlobal.turno_actual !== nombreUsuario) {
        mostrarToast("¡Tranquilo marinero, no es tu turno!", 'warning');
        return;
    }

    let bazaActual = dataGlobal.baza_actual || [];

    // Validar color líder
    if (carta.tipo === 'numero') {
        const primeraNumerica = bazaActual.find(c => c.tipo === 'numero');
        if (primeraNumerica) {
            const colorLider = primeraNumerica.color;
            const miMano = dataGlobal.jugadores[nombreUsuario].mano || [];
            const tengoColorLider = miMano.some(c => c.tipo === 'numero' && c.color === colorLider);
            if (tengoColorLider && carta.color !== colorLider) {
                mostrarToast(`¡Trampa pirata! Debes servir al color ${colorLider.toUpperCase()}.`, 'error', 4000);
                return;
            }
        }
    }

    // Tigresa: elegir modo
    let cartaJugada;
    if (carta.tipo === 'tigresa') {
        const esPirata = await mostrarConfirm(
            '¿Cómo quieres jugar la <strong style="color:#ff8c00;">Tigresa</strong>?',
            '🐱 Como Pirata',
            '🏳️ Como Huida'
        );
        cartaJugada = { ...carta, tipo: esPirata ? 'pirata' : 'huida', jugadoPor: nombreUsuario };
    } else {
        cartaJugada = { ...carta, jugadoPor: nombreUsuario };
    }

    const ordenJugadores = dataGlobal.orden_jugadores || Object.keys(dataGlobal.jugadores);
    bazaActual = [...bazaActual, cartaJugada];

    let miManoLimpia = [...(dataGlobal.jugadores[nombreUsuario].mano || [])];
    miManoLimpia.splice(index, 1);

    let actualizaciones = {};
    actualizaciones[`jugadores/${nombreUsuario}/mano`] = miManoLimpia;
    actualizaciones[`baza_actual`] = bazaActual;

    const todosTiraron = bazaActual.length === ordenJugadores.length;

    if (!todosTiraron) {
        const miIndex = ordenJugadores.indexOf(nombreUsuario);
        actualizaciones[`turno_actual`] = ordenJugadores[(miIndex + 1) % ordenJugadores.length];
        await update(salaRef, actualizaciones);
    } else {
        actualizaciones[`turno_actual`] = "nadie";
        await update(salaRef, actualizaciones);
        procesarFinDeBaza(idSala, bazaActual, dataGlobal);
    }
}
