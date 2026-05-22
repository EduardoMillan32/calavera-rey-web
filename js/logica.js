import { db } from './firebase-config.js';
import { ref, get, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// BUG C FIX: aceptar rondaOverride para evitar leer la ronda vieja de Firebase
// cuando hay micro-latencia entre el update(ronda+1) y el get() interno.
export async function iniciarRonda(idSala, rondaOverride = null) {
    const salaRef = ref(db, `calavera_rey/salas/${idSala}`);
    const snapshot = await get(salaRef);
    const data = snapshot.val();
    if (!data || !data.jugadores) return;

    const mazo = generarMazoCalavera(); // 72 cartas
    const nombresJugadores = data.orden_jugadores || Object.keys(data.jugadores);
    // Usar el valor pasado directamente si existe, para no depender de la lectura de Firebase
    const rondaActual = rondaOverride ?? data.ronda ?? 1;
    const numJugadores = nombresJugadores.length;

    // BUG A FIX: calcular cuántas cartas se pueden repartir sin quedarse sin mazo
    // El mazo tiene 72 cartas. Si rondaActual * numJugadores > 72, reducir a lo que alcance.
    const cartasPorJugador = Math.min(rondaActual, Math.floor(72 / numJugadores));

    let actualizaciones = {};

    nombresJugadores.forEach(nombre => {
        actualizaciones[`jugadores/${nombre}/mano`] = mazo.splice(0, cartasPorJugador);
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
        return { ganador: baza[0].jugadoPor, bazaDestruida: false };
    }

    const triunfos = cartasColor.filter(c => c.color === 'negro');
    if (triunfos.length > 0) {
        triunfos.sort((a, b) => b.valor - a.valor);
        return { ganador: triunfos[0].jugadoPor, bazaDestruida: false };
    }

    const primeraNumerica = baza.find(c => c.tipo === 'numero');
    const colorLider = primeraNumerica.color;
    const cartasLider = cartasColor.filter(c => c.color === colorLider);
    cartasLider.sort((a, b) => b.valor - a.valor);
    return { ganador: cartasLider[0].jugadoPor, bazaDestruida: false };
}

function calcularBonificaciones(baza, ganador) {
    let bonus = 0;
    const skullKing = baza.find(c => c.tipo === 'skullking');
    const sirenas = baza.filter(c => c.tipo === 'sirena');   // BUG C FIX: filter
    const piratas = baza.filter(c => c.tipo === 'pirata');   // BUG C FIX: filter

    // Sirena captura Skull King: +40 pts (por cada sirena que haya)
    if (skullKing && sirenas.length > 0 && ganador === sirenas[0].jugadoPor) {
        bonus += 40 * sirenas.length;
    }

    // Skull King captura piratas: +30 pts por CADA pirata capturado
    if (piratas.length > 0 && skullKing && ganador === skullKing.jugadoPor) {
        bonus += 30 * piratas.length;
    }

    // Pirata captura sirenas: +20 pts por CADA sirena capturada
    if (sirenas.length > 0 && piratas.length > 0 && ganador === piratas[0].jugadoPor) {
        bonus += 20 * sirenas.length;
    }

    // 14 de color en baza ganada
    baza.forEach(c => {
        if (c.tipo === 'numero' && c.valor === 14) {
            bonus += c.color === 'negro' ? 20 : 10;
        }
    });

    return bonus;
}

export async function procesarFinDeBaza(idSala, baza, dataGlobal) {
    const salaRef = ref(db, `calavera_rey/salas/${idSala}`);
    const procesandoRef = ref(db, `calavera_rey/salas/${idSala}/procesando_baza`);

    // BUG E FIX: usar runTransaction para evitar condición de carrera (TOCTOU)
    // Solo el primer cliente que llegue podrá cambiar procesando_baza de null a true
    let fueElegido = false;
    await runTransaction(procesandoRef, (valorActual) => {
        if (valorActual) {
            // Ya está siendo procesado por otro cliente — abortar
            return; // retornar undefined cancela la transacción sin cambios
        }
        fueElegido = true;
        return true; // marcar como procesando
    });

    if (!fueElegido) return; // otro cliente ganó la carrera

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

    const nombresJugadores = dataFinal.orden_jugadores || Object.keys(dataFinal.jugadores);
    let quedanCartas = false;

    nombresJugadores.forEach(n => {
        if (dataFinal.jugadores[n].mano && dataFinal.jugadores[n].mano.length > 0) {
            quedanCartas = true;
        }
    });

    if (!quedanCartas) {
        const rondaActual = dataFinal.ronda;

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
