import { db } from './firebase-config.js';
import { ref, set, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// BUG B FIX: limpiar caracteres prohibidos por Firebase Realtime Database (. # $ [ ])
function limpiarNombre(str) {
    return str.replace(/[.#$\[\]]/g, '').trim();
}

document.getElementById('btnTV').onclick = async () => {
    const sala = limpiarNombre(document.getElementById('idSala').value.trim().toLowerCase());
    if (!sala) return alert("¡Ponle nombre al barco, marinero!");

    const salaRef = ref(db, `calavera_rey/salas/${sala}`);
    const snapshot = await get(salaRef);

    if (!snapshot.exists()) {
        await set(salaRef, { estado: 'esperando', ronda: 1, tieneTableroTV: true });
    } else {
        await update(salaRef, { tieneTableroTV: true });
    }

    sessionStorage.setItem('idSala', sala);
    window.location.href = 'tv.html';
};

document.getElementById('btnJugador').onclick = async () => {
    const sala = limpiarNombre(document.getElementById('idSala').value.trim().toLowerCase());
    const nombre = limpiarNombre(document.getElementById('nombreUsuario').value.trim());

    if (!sala || !nombre) return alert("¡Necesitamos tu nombre y el del barco!");

    const salaRef = ref(db, `calavera_rey/salas/${sala}`);
    const snapshot = await get(salaRef);

    if (snapshot.exists() && snapshot.val().jugadores) {
        if (Object.keys(snapshot.val().jugadores).length >= 8 && !snapshot.val().jugadores[nombre]) {
            return alert("¡El barco ya zarpó lleno! Máximo 8 marineros por partida.");
        }
    }

    // Asignar Capitán si no existe
    if (!snapshot.exists()) {
        await set(salaRef, { estado: 'esperando', ronda: 1, tieneTableroTV: false, host: nombre });
    } else if (!snapshot.val().host) {
        await update(salaRef, { host: nombre });
    }

    const jugadorRef = ref(db, `calavera_rey/salas/${sala}/jugadores/${nombre}`);
    await set(jugadorRef, {
        nombre: nombre,
        apuesta: -1,
        bazasGanadas: 0,
        puntos: 0,
        mano: [],
        listo: false
    });

    sessionStorage.setItem('idSala', sala);
    sessionStorage.setItem('usuarioNombre', nombre);
    window.location.href = 'jugador.html';
};
