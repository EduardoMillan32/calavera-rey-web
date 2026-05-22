import { db } from './firebase-config.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

function barajar(mazo) {
    for (let i = mazo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
    }
    return mazo;
}

export function generarMazoCalavera() {
    let mazo = [];
    const colores = ['verde', 'amarillo', 'morado', 'negro'];

    colores.forEach(color => {
        for (let i = 1; i <= 14; i++) {
            mazo.push({ tipo: 'numero', color: color, valor: i });
        }
    });

    for (let i = 0; i < 5; i++) mazo.push({ tipo: 'pirata', valor: 'Pirata' });
    for (let i = 0; i < 5; i++) mazo.push({ tipo: 'huida', valor: 'Huida' });
    for (let i = 0; i < 2; i++) mazo.push({ tipo: 'sirena', valor: 'Sirena' });

    mazo.push({ tipo: 'tigresa', valor: 'Tigresa' });
    mazo.push({ tipo: 'skullking', valor: 'Skull King' });
    mazo.push({ tipo: 'kraken', valor: 'Kraken' });
    mazo.push({ tipo: 'ballena', valor: 'Ballena Blanca' });

    return barajar(mazo);
}

export async function iniciarRonda(idSala) {
    const salaRef = ref(db, `calavera_rey/salas/${idSala}`);
    const snapshot = await get(salaRef);
    const data = snapshot.val();
    if (!data || !data.jugadores) return;

    const mazo = generarMazoCalavera();
    // BUG 12 FIX: usar orden_jugadores guardado, o el orden actual como fallback
    const nombresJugadores = data.orden_jugadores || Object.keys(data.jugadores);
    const rondaActual = data.ronda || 1;
    let actualizaciones = {};

    nombresJugadores.forEach(nombre => {
        actualizaciones[`jugadores/${nombre}/mano`] = mazo.splice(0, rondaActual);
        actualizaciones[`jugadores/${nombre}/apuesta`] = -1;
        actualizaciones[`jugadores/${nombre}/bazasGanadas`] = 0;
        actualizaciones[`jugadores/${nombre}/bonos_temp`] = 0;
        actualizaciones[`jugadores/${nombre}/listo_siguiente`] = false;
    });

    const repartidorIndex = data.repartidor_index || 0;
    const primerJugadorIndex = (repartidorIndex + 1) % nombresJugadores.length;

    actualizaciones['estado'] = 'apuestas';
    actualizaciones['turno_actual'] = nombresJugadores[primerJugadorIndex];
    actualizaciones['repartidor_index'] = primerJugadorIndex;
    actualizaciones['baza_actual'] = [];
    actualizaciones['ultimo_ganador'] = null;
    // BUG 12 FIX: guardar el orden de jugadores si aún no existe
    if (!data.orden_jugadores) {
        actualizaciones['orden_jugadores'] = Object.keys(data.jugadores);
    }

    await update(salaRef, actualizaciones);
}

function evaluarBaza(baza) {
    const kraken = baza.find(c => c.tipo === 'kraken');
    const ballena = baza.find(c => c.tipo === 'ballena');

    let efecto = null;
    if (kraken && ballena) {
        const idxKraken = baza.indexOf(kraken);
        const idxBallena = baza.indexOf(ballena);
        efecto = idxKraken > idxBallena ? 'kraken' : 'ballena';
    } else if (kraken) {
        efecto = 'kraken';
    } else if (ballena) {
        efecto = 'ballena';
    }

    if (efecto === 'kraken') {
        const bazaSinKraken = baza.filter(c => c.tipo !== 'kraken');
        const ganadorHipotetico = bazaSinKraken.length > 0
            ? evaluarBaza(bazaSinKraken).ganador
            : baza[0].jugadoPor;
        return { ganador: ganadorHipotetico, bazaDestruida: true };
    }

    if (efecto === 'ballena') {
        const numericas = baza.filter(c => c.tipo === 'numero');
        if (numericas.length === 0) {
            return { ganador: ballena.jugadoPor, bazaDestruida: true };
        }
        numericas.sort((a, b) => b.valor - a.valor);
        return { ganador: numericas[0].jugadoPor, bazaDestruida: false };
    }

    const sirena = baza.find(c => c.tipo === 'sirena');
    const pirata = baza.find(c => c.tipo === 'pirata');
    const skullKing = baza.find(c => c.tipo === 'skullking');

    if (skullKing && sirena) {
        return { ganador: sirena.jugadoPor, bazaDestruida: false };
    }
    if (skullKing) {
        return { ganador: skullKing.jugadoPor, bazaDestruida: false };
    }
    if (pirata) {
        return { ganador: pirata.jugadoPor, bazaDestruida: false };
    }
    if (sirena) {
        return { ganador: sirena.jugadoPor, bazaDestruida: false };
    }

    const cartasColor = baza.filter(c => c.tipo === 'numero');
    if (cartasColor.length === 0) {
        // BUG 14: todos jugaron huida/especial sin ganador → gana el primero
        return { ganador: baza[0].jugadoPor, bazaDestruida: false };
    }

    const triunfos = cartasColor.filter(c => c.color === 'negro');
    if (triunfos.length > 0) {
        triunfos.sort((a, b) => b.valor - a.valor);
        return { ganador: triunfos[0].jugadoPor, bazaDestruida: false };
    }

    // BUG 13 FIX: buscar la primera carta numérica (no la primera carta de la baza)
    const primeraNumerica = baza.find(c => c.tipo === 'numero');
    const colorLider = primeraNumerica.color;
    const cartasLider = cartasColor.filter(c => c.color === colorLider);
    cartasLider.sort((a, b) => b.valor - a.valor);
    return { ganador: cartasLider[0].jugadoPor, bazaDestruida: false };
}

function calcularBonificaciones(baza, ganador) {
    let bonus = 0;
    const skullKing = baza.find(c => c.tipo === 'skullking');
    const sirena = baza.find(c => c.tipo === 'sirena');
    const pirata = baza.find(c => c.tipo === 'pirata');

    if (skullKing && sirena && ganador === sirena.jugadoPor) {
        bonus += 40;
    }
    if (pirata && skullKing && ganador === skullKing.jugadoPor) {
        bonus += 30;
    }
    if (sirena && pirata && ganador === pirata.jugadoPor) {
        bonus += 20;
    }

    baza.forEach(c => {
        if (c.tipo === 'numero' && c.valor === 14) {
            bonus += c.color === 'negro' ? 20 : 10;
        }
    });

    return bonus;
}

export async function procesarFinDeBaza(idSala, baza, dataGlobal) {
    const salaRef = ref(db, `calavera_rey/salas/${idSala}`);

    const snapGuarda = await get(salaRef);
    if (snapGuarda.val()?.procesando_baza) return;
    await update(salaRef, { procesando_baza: true });

    await new Promise(r => setTimeout(r, 3000));

    const snapFinal = await get(salaRef);
    const dataFinal = snapFinal.val();

    const resultado = evaluarBaza(baza);
    const ganador = resultado.ganador;
    let actualizaciones = {};

    if (!resultado.bazaDestruida) {
        const bazasActuales = dataFinal.jugadores[ganador].bazasGanadas || 0;
        actualizaciones[`jugadores/${ganador}/bazasGanadas`] = bazasActuales + 1;

        const bonosGanados = calcularBonificaciones(baza, ganador);
        const bonosAcumulados = dataFinal.jugadores[ganador].bonos_temp || 0;
        actualizaciones[`jugadores/${ganador}/bonos_temp`] = bonosAcumulados + bonosGanados;
    }

    actualizaciones['baza_actual'] = [];
    actualizaciones['ultimo_ganador'] = ganador;
    actualizaciones['turno_actual'] = ganador;

    // BUG 12 FIX: usar orden_jugadores
    const nombresJugadores = dataFinal.orden_jugadores || Object.keys(dataFinal.jugadores);
    let quedanCartas = false;

    nombresJugadores.forEach(n => {
        if (dataFinal.jugadores[n].mano && dataFinal.jugadores[n].mano.length > 0) {
            quedanCartas = true;
        }
    });

    if (!quedanCartas) {
        const rondaActual = dataFinal.ronda;

        // BUG 1 FIX: preparar historial de la ronda
        const historialRonda = {
            ronda: rondaActual,
            resultados: {}
        };

        nombresJugadores.forEach(n => {
            const j = dataFinal.jugadores[n];
            const apuesta = j.apuesta;
            const bonosTemp = j.bonos_temp || 0;

            let bazasFinales = j.bazasGanadas || 0;
            if (n === ganador && !resultado.bazaDestruida) {
                bazasFinales = bazasFinales + 1;
            }

            let puntosRonda = 0;

            if (apuesta === bazasFinales) {
                if (apuesta === 0) {
                    puntosRonda = (rondaActual * 10) + bonosTemp;
                } else {
                    puntosRonda = (apuesta * 20) + bonosTemp;
                }
            } else {
                if (apuesta === 0) {
                    puntosRonda = -(rondaActual * 10);
                } else {
                    puntosRonda = -(Math.abs(apuesta - bazasFinales) * 10);
                }
            }

            const totalAcumulado = (j.puntos || 0) + puntosRonda;

            // BUG 1 FIX: guardar resultado individual en el historial
            historialRonda.resultados[n] = {
                apuesta: apuesta,
                bazasGanadas: bazasFinales,
                puntosRonda: puntosRonda,
                bonos: bonosTemp,
                totalAcumulado: totalAcumulado
            };

            actualizaciones[`jugadores/${n}/puntos`] = totalAcumulado;
            actualizaciones[`jugadores/${n}/bonos_temp`] = 0;
            actualizaciones[`jugadores/${n}/listo_siguiente`] = false;
        });

        // BUG 1 FIX: guardar historial en Firebase
        actualizaciones[`historial/ronda_${rondaActual}`] = historialRonda;

        const maxRondas = dataFinal.max_rondas || 10;
        if (rondaActual >= maxRondas) {
            actualizaciones['estado'] = 'fin_juego';
        } else {
            actualizaciones['estado'] = 'fin_ronda';
        }
    }

    actualizaciones['procesando_baza'] = null;
    await update(salaRef, actualizaciones);
}
