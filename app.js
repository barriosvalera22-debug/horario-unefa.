/**
 * app.js — Sistema de Horarios UNEFA
 * Llave compuesta: career__semester__dayId__slotIndex
 * Cada slot almacena: { prof: "Prof. X", materia: "Cálculo Numérico" }
 */

// ═══════════════════════════ DATOS ═══════════════════════════

const SEMESTERS = [
    'CINU', '1er Semestre', '2do Semestre', '3er Semestre',
    '4to Semestre', '5to Semestre', '6to Semestre', '7mo Semestre', '8vo Semestre'
];

const TIME_SLOTS = [
    '07:45 - 08:30', '08:30 - 09:15', '09:15 - 10:00',
    '10:00 - 10:45', '10:45 - 11:30', '11:30 - 12:15', '12:15 - 13:00',
    '13:00 - 13:45', '13:45 - 14:30', '14:30 - 15:15', '15:15 - 16:00',
    '16:00 - 16:45', '16:45 - 17:30', '17:30 - 18:15', '18:15 - 19:00',
    '19:00 - 19:45', '19:45 - 20:30',
];

const MORNING_END_IDX = 6; // índices 0–6 = MAÑANA, 7+ = TARDE

const DAYS = [
    { id: 'lunes', label: 'LUNES' },
    { id: 'martes', label: 'MARTES' },
    { id: 'miercoles', label: 'MIÉRCOLES' },
    { id: 'jueves', label: 'JUEVES' },
    { id: 'viernes', label: 'VIERNES' },
    { id: 'sabado', label: 'SÁBADO' },
];

const CAREERS_MAP = {
    'sistemas': 'Ingeniería de Sistemas',
    'enfermeria': 'Enfermería',
    'administracion': 'Administración y G.M.',
};

// ═══════════════════════════ DB API ═══════════════════════════
// Cache local + llamadas fetch() al backend con token JWT

// 🔑 Helper: fetch autenticado (envía el token JWT en cada petición)
function authFetch(url, options = {}) {
    const token = localStorage.getItem('jwt_token');
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (options.body) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    return fetch(url, { ...options, headers });
}

class ReservationAPI {
    constructor() { this._cache = {}; }

    async fetchAll() {
        try {
            const res = await authFetch('/api/reservations');
            const data = await res.json();
            this._cache = data.reservations || {};
        } catch (e) { console.error('Error cargando reservas:', e); }
        return this._cache;
    }

    getAll() { return this._cache; }

    getSlot(career, sem, section, day, idx) {
        return this._cache[`${career}__${sem}__${section}__${day}__${idx}`] || null;
    }

    async reserve(career, sem, section, day, idx, prof, materia, classroom) {
        try {
            const res = await authFetch('/api/reservations', {
                method: 'POST',
                body: JSON.stringify({ career, semester: sem, section, day, slotIdx: idx, prof, materia, classroom })
            });
            const data = await res.json();
            if (data.success) {
                this._cache[`${career}__${sem}__${section}__${day}__${idx}`] = { prof, materia, classroom };
                return { success: true };
            }
            return { success: false, message: data.message };
        } catch (e) { console.error('Error reservando:', e); return { success: false, message: 'Error de red.' }; }
    }

    async free(career, sem, section, day, idx) {
        const key = `${career}__${sem}__${section}__${day}__${idx}`;
        try {
            await authFetch(`/api/reservations/slot/${encodeURIComponent(key)}`, { method: 'DELETE' });
            delete this._cache[key];
        } catch (e) { console.error('Error liberando:', e); }
    }

    async resetAll() {
        try {
            await authFetch('/api/reservations/reset/all', { method: 'DELETE' });
            this._cache = {};
        } catch (e) { console.error('Error reseteando:', e); }
    }
}

const db = new ReservationAPI();

// ═══════════════════════════ ESTADO ═══════════════════════════

let currentUser = null;
let currentCareer = '';
let currentSemester = '';
let currentSection = '';
let adminCareer = '';
let adminSemester = '';
let adminSection = '';

// Estado temporal del modal
let pendingSlot = null; // { dayId, slotIdx, dayLabel, timeLabel }

// ═══════════════════════════ DOM ════════════════════════════════

const viewLogin = document.getElementById('view-login');
const viewDashboard = document.getElementById('view-dashboard');
const panelFiltro = document.getElementById('panel-filtro');
const panelAdminFilters = document.getElementById('panel-admin-filters');
const selectCareer = document.getElementById('select-career');
const selectSemester = document.getElementById('select-semester');
const schedulerCont = document.getElementById('scheduler-container');
const scheduleBody = document.getElementById('schedule-body');
const statusIndicator = document.getElementById('status-indicator');
const gridTitle = document.getElementById('grid-title');
const gridSubtitle = document.getElementById('grid-subtitle');
const adminScheduleView = document.getElementById('admin-schedule-view');
const btnDownloadPdf = document.getElementById('btn-download-pdf');

// Modal
const modalReservar = document.getElementById('modal-reservar');
const modalForm = document.getElementById('modal-form');
const modalInfo = document.getElementById('modal-info');
const modalMateria = document.getElementById('modal-materia');
const modalClassroom = document.getElementById('modal-classroom');

// ═══════════════════════════════════════════════════
// ✅ MEJORA 1: Sistema de Toasts
// ═══════════════════════════════════════════════════
const toastContainer = document.getElementById('toast-container');

/**
 * @param {string} message  - Texto principal
 * @param {string} sub      - Subtexto pequeño (opcional)
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration - ms antes de desaparecer (default 3500)
 */
function showToast(message, sub = '', type = 'success', duration = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const typeClass = type === 'error' ? 'toast-error' : type === 'warning' ? 'toast-warning' : type === 'info' ? 'toast-info' : '';

    const toast = document.createElement('div');
    toast.className = `toast ${typeClass}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '✅'}</span>
        <div class="toast-msg">
            ${message}
            ${sub ? `<div class="toast-sub">${sub}</div>` : ''}
        </div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ═══════════════════════════ USER API ═══════════════════════════

class UserAPI {
    constructor() { this._cache = []; }

    seed() { /* El servidor hace el seed automáticamente */ }

    async fetchAll() {
        try {
            const res = await authFetch('/api/users');
            const data = await res.json();
            this._cache = data.users || [];
        } catch (e) { console.error('Error cargando usuarios:', e); }
        return this._cache;
    }

    getAll() { return this._cache; }

    async find(username, password) {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success && data.token) {
                // 🔑 Guardar token JWT
                localStorage.setItem('jwt_token', data.token);
            }
            return data.success ? data.user : null;
        } catch (e) { console.error('Error login:', e); return null; }
    }

    async add(username, password, name) {
        try {
            const res = await authFetch('/api/users', {
                method: 'POST',
                body: JSON.stringify({ username, password, name })
            });
            const data = await res.json();
            if (data.success) await this.fetchAll();
            return data.success;
        } catch (e) { console.error('Error creando usuario:', e); return false; }
    }

    async remove(username) {
        try {
            const res = await authFetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) await this.fetchAll();
            return data.success;
        } catch (e) { console.error('Error eliminando:', e); return false; }
    }
}

const userDB = new UserAPI();
userDB.seed();

// ═══════════════════════════ AUTH ════════════════════════════════

const loginError = (() => {
    const el = document.createElement('p');
    el.className = 'text-red-500 text-xs font-semibold text-center mt-1 hidden';
    el.id = 'login-error';
    document.getElementById('form-login').appendChild(el);
    return el;
})();

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
    document.getElementById('form-login').classList.add('animate-shake');
    setTimeout(() => document.getElementById('form-login').classList.remove('animate-shake'), 500);
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = document.getElementById('input-username').value.trim();
    const password = document.getElementById('input-password').value;

    const user = await userDB.find(username, password);
    if (!user) {
        showLoginError('Usuario o contraseña incorrectos.');
        return;
    }

    currentUser = { name: user.name, role: user.role, username: user.username };
    localStorage.setItem('user_data', JSON.stringify(currentUser));

    // Cargar datos del servidor
    await db.fetchAll();

    document.getElementById('profile-name').textContent = currentUser.name;
    document.getElementById('profile-role').textContent = currentUser.role === 'admin' ? 'Administrador' : 'Docente Activo';
    if (typeof updateAvatar === 'function') updateAvatar(currentUser.name);

    document.getElementById('input-password').value = '';

    viewLogin.classList.add('hidden');
    viewDashboard.classList.remove('hidden');
    viewDashboard.classList.add('flex');
    
    // Mostrar perfil en el header
    document.getElementById('header-profile').classList.remove('hidden');
    document.getElementById('header-profile').classList.add('flex');

    currentUser.role === 'admin' ? setupAdmin() : setupProfessor();
});

document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null; currentCareer = ''; currentSemester = '';
    // 🔑 Limpiar token JWT al cerrar sesión
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_data');
    viewDashboard.classList.add('hidden'); viewDashboard.classList.remove('flex');
    viewLogin.classList.remove('hidden');
    document.getElementById('input-username').value = '';
    document.getElementById('input-password').value = '';
    
    // Ocultar perfil en el header
    document.getElementById('header-profile').classList.add('hidden');
    document.getElementById('header-profile').classList.remove('flex');
    // Ocultar paneles adicionales al salir
    document.getElementById('panel-users')?.classList.add('hidden');
    document.getElementById('stats-panel')?.classList.add('hidden');
    // Asegurar vista de login activa
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('register-section').classList.add('hidden');
});

// ── Toggle Login ↔ Registro ──
document.getElementById('btn-go-register')?.addEventListener('click', () => {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.remove('hidden');
});
document.getElementById('btn-go-login')?.addEventListener('click', () => {
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
});

// ── Auto-registro de profesores ──
document.getElementById('form-register')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = document.getElementById('reg-name').value.trim();
    const cedula   = document.getElementById('reg-cedula').value.trim();
    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;

    if (!name || !cedula || !username || password.length < 4) return;

    const fullName = `${name} (C.I: ${cedula})`;

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name: fullName })
        });
        const data = await res.json();
        if (!data.success) {
            showToast('Usuario ya existe', data.message, 'error');
            return;
        }
        // 🔑 Guardar token JWT del registro
        if (data.token) localStorage.setItem('jwt_token', data.token);
    } catch (e) { showToast('Error de conexión', '', 'error'); return; }

    showToast('✅ Cuenta creada', `${fullName} — ya puedes iniciar sesión`, 'success');

    currentUser = { name: fullName, role: 'professor', username };
    localStorage.setItem('user_data', JSON.stringify(currentUser));
    await db.fetchAll();
    document.getElementById('profile-name').textContent = currentUser.name;
    document.getElementById('profile-role').textContent = 'Docente Activo';
    if (typeof updateAvatar === 'function') updateAvatar(currentUser.name);
    document.getElementById('header-profile').classList.remove('hidden');
    document.getElementById('header-profile').classList.add('flex');

    viewLogin.classList.add('hidden');
    viewDashboard.classList.remove('hidden');
    viewDashboard.classList.add('flex');
    setupProfessor();
});

// ═══════════════════════════ MODAL ══════════════════════════════

function openModal(dayId, slotIdx) {
    const dayObj = DAYS.find(d => d.id === dayId);
    pendingSlot = { dayId, slotIdx };
    modalInfo.textContent = `${dayObj.label} | ${TIME_SLOTS[slotIdx]}`;
    modalMateria.value = '';
    if (modalClassroom) modalClassroom.value = '';
    const modalBlocks = document.getElementById('modal-blocks');
    if (modalBlocks) modalBlocks.value = '1';
    modalReservar.classList.remove('hidden');
    setTimeout(() => modalMateria.focus(), 100);
}

function closeModal() {
    modalReservar.classList.add('hidden');
    pendingSlot = null;
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', closeModal);

modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const materia = modalMateria.value.trim();
    const classroom = modalClassroom ? modalClassroom.value.trim() : '';
    const modalBlocks = document.getElementById('modal-blocks');
    const numBlocks = modalBlocks ? parseInt(modalBlocks.value) : 1;

    if (!materia || !classroom || !pendingSlot) return;

    const { dayId, slotIdx } = pendingSlot;
    const dayObj = DAYS.find(d => d.id === dayId);
    
    let reservedCount = 0;
    let failReason = null;

    for (let i = 0; i < numBlocks; i++) {
        const currentIdx = slotIdx + i;
        if (currentIdx >= TIME_SLOTS.length) break;
        if (currentIdx === 6) {
            if (numBlocks > 1) failReason = 'Se detuvo al llegar al receso.';
            break; 
        }
        
        const existing = db.getSlot(currentCareer, currentSemester, currentSection, dayId, currentIdx);
        if (existing) {
            if (numBlocks > 1) failReason = 'Se detuvo al encontrar un bloque ocupado.';
            break;
        }
        
        const result = await db.reserve(currentCareer, currentSemester, currentSection, dayId, currentIdx, currentUser.name, materia, classroom);
        if (result.success) reservedCount++;
        else {
            failReason = result.message;
            break;
        }
    }

    if (reservedCount > 0) {
        showToast(
            `Reservado: <strong>${materia}</strong>`,
            `${dayObj.label} · ${reservedCount} franja(s) · 📍 ${classroom}`,
            'success'
        );
        if (failReason) {
            setTimeout(() => showToast('Aviso', `Solo se reservaron ${reservedCount} franjas. ${failReason}`, 'info'), 500);
        }
        renderGrid();
        updateProgressBar();
    } else {
        showToast('No se pudo reservar', failReason || 'El espacio no está disponible.', 'error');
    }
    closeModal();
});

// ═══════════════════════════ PROFESOR ═══════════════════════════

function setupProfessor() {
    panelFiltro.classList.remove('hidden');
    panelAdminFilters.classList.add('hidden');
    schedulerCont.classList.remove('hidden');
    adminScheduleView.classList.add('hidden');
    adminScheduleView.classList.remove('flex');
    btnDownloadPdf.classList.add('hidden');
    gridTitle.textContent = 'Disponibilidad de Horarios';
    gridSubtitle.textContent = 'Selecciona Carrera, Semestre y Sección para comenzar.';
    setSchedulerActive(false);
}

selectCareer.addEventListener('change', (e) => {
    currentCareer = e.target.value; currentSemester = ''; currentSection = '';
    populateSemesters(selectSemester);
    selectSemester.disabled = false;
    document.getElementById('select-section').disabled = true;
    document.getElementById('select-section').innerHTML = '<option value="" disabled selected>-- Primero elige semestre --</option>';
    setSchedulerActive(false);
});

selectSemester.addEventListener('change', async (e) => {
    currentSemester = e.target.value; currentSection = '';
    const secSelect = document.getElementById('select-section');
    secSelect.innerHTML = '<option value="" disabled selected>-- Cargando... --</option>';
    secSelect.disabled = true;
    setSchedulerActive(false);
    // Cargar secciones del servidor
    try {
        const res = await authFetch(`/api/sections?career=${currentCareer}&semester=${currentSemester}`);
        const data = await res.json();
        secSelect.innerHTML = '<option value="" disabled selected>-- Elige sección --</option>';
        (data.sections || []).forEach(s => {
            const o = document.createElement('option');
            o.value = s.code; o.textContent = s.code;
            secSelect.appendChild(o);
        });
        secSelect.disabled = (data.sections || []).length === 0;
        if ((data.sections || []).length === 0) {
            secSelect.innerHTML = '<option value="" disabled selected>-- No hay secciones --</option>';
        }
    } catch (e) { console.error(e); }
});

document.getElementById('select-section').addEventListener('change', (e) => {
    currentSection = e.target.value;
    setSchedulerActive(true);
    showSkeletonGrid();
    setTimeout(() => { renderGrid(); updateProgressBar(); }, 450);
});

function populateSemesters(selectEl) {
    selectEl.innerHTML = '<option value="" disabled selected>-- Elige semestre --</option>';
    SEMESTERS.forEach((s, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = s;
        selectEl.appendChild(o);
    });
}

function setSchedulerActive(active) {
    if (active) {
        schedulerCont.classList.remove('opacity-40', 'pointer-events-none');
        statusIndicator.classList.remove('hidden'); statusIndicator.classList.add('flex');
        gridTitle.textContent = `${CAREERS_MAP[currentCareer]} — ${currentSection}`;
        gridSubtitle.textContent = 'Haz clic en una celda disponible para reservar tu franja horaria.';
    } else {
        schedulerCont.classList.add('opacity-40', 'pointer-events-none');
        statusIndicator.classList.add('hidden'); statusIndicator.classList.remove('flex');
    }
}

// ═══════════════════════════ GRILLA PROFESOR ════════════════════

function renderGrid() {
    scheduleBody.innerHTML = '';
    TIME_SLOTS.forEach((timeLabel, idx) => {
        const tr = document.createElement('tr');

        // Celda hora
        const tdTime = document.createElement('td');
        tdTime.className = 'time-cell'; tdTime.textContent = timeLabel;
        tr.appendChild(tdTime);

        if (idx === 6) {
            const td = document.createElement('td');
            td.colSpan = 6;
            td.className = 'bg-gray-100 text-center py-2 border border-gray-200 shadow-inner';
            td.innerHTML = '<span class="text-sm font-extrabold text-gray-500 uppercase tracking-[0.4em]">☕ RECESO</span>';
            tr.appendChild(td);
        } else {
            DAYS.forEach(day => {
                if (idx === 0 && day.id === 'lunes') {
                    const td = document.createElement('td'); td.className = 'slot-cell';
                    const btn = document.createElement('button');
                    btn.className = 'slot-btn state-taken flex flex-col items-center justify-center !bg-yellow-50 !border-yellow-200';
                    btn.disabled = true;
                    btn.title = 'Acto Cívico Institucional';
                    btn.innerHTML = `<span class="slot-materia-text text-yellow-700">🇻🇪 ACTO CÍVICO</span>
                                     <div class="text-[9px] mt-0.5 font-bold text-yellow-600 leading-tight">Obligatorio</div>`;
                    td.appendChild(btn); tr.appendChild(td);
                    return;
                }

                const slot = db.getSlot(currentCareer, currentSemester, currentSection, day.id, idx);
                const isOccupied = slot !== null;
                const isMine = isOccupied && slot.prof === currentUser.name;

                const td = document.createElement('td'); td.className = 'slot-cell';
                const btn = document.createElement('button');

                if (isMine) {
                    // ── Mi reserva (azul) ──
                    btn.className = 'slot-btn state-mine flex flex-col items-center justify-center';
                    btn.title = `${slot.materia} — click para liberar`;
                    btn.innerHTML = `<span class="slot-materia-text">✓ ${slot.materia}</span>
                                     <div class="text-[9px] mt-0.5 font-normal opacity-80 leading-tight">📍 ${slot.classroom || 'Sin Aula'}</div>`;
                    btn.onclick = async () => {
                        if (confirm(`¿Liberar "${slot.materia}" el ${day.label} ${timeLabel}?`)) {
                            await db.free(currentCareer, currentSemester, currentSection, day.id, idx);
                            showToast(
                                `Liberado: <strong>${slot.materia}</strong>`,
                                `${day.label} · ${timeLabel}`,
                                'info'
                            );
                            renderGrid();
                            updateProgressBar();
                        }
                    };
                } else if (isOccupied) {
                    // ── Tomado por otro (rojo) ──
                    btn.className = 'slot-btn state-taken flex flex-col items-center justify-center';
                    btn.disabled = true;
                    btn.title = `${slot.materia} — ${slot.prof}`;
                    btn.innerHTML = `<span class="slot-materia-text">${slot.materia}</span>
                                     <div class="text-[9px] mt-0.5 font-normal opacity-80 leading-tight">📍 ${slot.classroom || 'Sin Aula'}</div>`;
                } else {
                    // ── Libre (verde) ──
                    btn.className = 'slot-btn state-free';
                    btn.title = 'Disponible — clic para reservar';
                    btn.onclick = () => openModal(day.id, idx);
                }

                td.appendChild(btn); tr.appendChild(td);
            });
        }
        scheduleBody.appendChild(tr);
    });
}

// ═══════════════════════════ ADMIN ══════════════════════════════

function setupAdmin() {
    panelFiltro.classList.add('hidden');
    panelAdminFilters.classList.remove('hidden');
    schedulerCont.classList.add('hidden');
    gridTitle.textContent = 'Panel de Administración';
    gridSubtitle.textContent = 'Selecciona Carrera y Semestre para visualizar y exportar el horario.';

    const adminCareerSel = document.getElementById('admin-select-career');
    const adminSemesterSel = document.getElementById('admin-select-semester');
    const adminSectionSel = document.getElementById('admin-select-section');
    const btnView = document.getElementById('btn-admin-view-schedule');

    adminCareerSel.addEventListener('change', (e) => {
        adminCareer = e.target.value; adminSemester = ''; adminSection = '';
        populateSemesters(adminSemesterSel);
        adminSemesterSel.disabled = false;
        adminSectionSel.disabled = true;
        adminSectionSel.innerHTML = '<option value="" disabled selected>-- Primero elige semestre --</option>';
        btnView.disabled = true;
    });

    adminSemesterSel.addEventListener('change', async (e) => {
        adminSemester = e.target.value; adminSection = '';
        adminSectionSel.innerHTML = '<option value="" disabled selected>-- Cargando... --</option>';
        adminSectionSel.disabled = true;
        btnView.disabled = true;
        try {
            const res = await authFetch(`/api/sections?career=${adminCareer}&semester=${adminSemester}`);
            const data = await res.json();
            adminSectionSel.innerHTML = '<option value="" disabled selected>-- Elige sección --</option>';
            (data.sections || []).forEach(s => {
                const o = document.createElement('option');
                o.value = s.code; o.textContent = s.code;
                adminSectionSel.appendChild(o);
            });
            adminSectionSel.disabled = (data.sections || []).length === 0;
            if ((data.sections || []).length === 0) {
                adminSectionSel.innerHTML = '<option value="" disabled selected>-- No hay secciones --</option>';
            }
        } catch (e) { console.error(e); }
    });

    adminSectionSel.addEventListener('change', (e) => {
        adminSection = e.target.value;
        btnView.disabled = false;
    });

    btnView.addEventListener('click', renderAdminSchedule);

    // ✅ MEJORA 2: Búsqueda en tiempo real
    const adminSearch = document.getElementById('admin-search');
    if (adminSearch) {
        adminSearch.addEventListener('input', () => {
            const q = adminSearch.value.trim().toLowerCase();
            // Filtrar filas de la tabla resumen
            const rows = document.querySelectorAll('#admin-summary-body tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = q === '' || text.includes(q) ? '' : 'none';
            });
            // Resaltar/atenuar celdas de la grilla
            const cells = document.querySelectorAll('#admin-grid-body .admin-td-slot.occupied');
            cells.forEach(cell => {
                const text = cell.textContent.toLowerCase();
                if (q === '') {
                    cell.style.opacity = '';
                    cell.style.outline = '';
                } else if (text.includes(q)) {
                    cell.style.opacity = '1';
                    cell.style.outline = '2px solid #0a3066';
                } else {
                    cell.style.opacity = '0.2';
                    cell.style.outline = '';
                }
            });
        });
    }
}

// ── Grilla institucional Admin ──────────────────────────────────

function renderAdminSchedule() {
    adminScheduleView.classList.remove('hidden');
    adminScheduleView.classList.add('flex');
    btnDownloadPdf.classList.remove('hidden');
    btnDownloadPdf.classList.add('flex');

    const careerLabel = CAREERS_MAP[adminCareer] || adminCareer;
    const semesterLabel = SEMESTERS[parseInt(adminSemester)] || '—';

    document.getElementById('admin-schedule-title').textContent =
        `CARRERA: ${careerLabel.toUpperCase()} — ${adminSection}`;
    gridTitle.textContent = careerLabel;
    gridSubtitle.textContent = `Vista institucional — ${semesterLabel} — ${adminSection}`;

    const tbody = document.getElementById('admin-grid-body');
    const summaryBody = document.getElementById('admin-summary-body');
    tbody.innerHTML = '';
    summaryBody.innerHTML = '';

    const summaryRows = [];

    TIME_SLOTS.forEach((timeLabel, idx) => {
        const tr = document.createElement('tr');
        const turno = idx <= MORNING_END_IDX ? 'MAÑANA' : 'TARDE';
        const turnoStart = turno === 'MAÑANA' ? 0 : MORNING_END_IDX + 1;
        const turnoSpan = turno === 'MAÑANA' ? MORNING_END_IDX + 1 : TIME_SLOTS.length - MORNING_END_IDX - 1;

        // TURNO (solo en el primer slot de cada turno con rowspan)
        if (idx === turnoStart) {
            const tdTurno = document.createElement('td');
            tdTurno.className = 'admin-td-turno';
            tdTurno.rowSpan = turnoSpan;
            tdTurno.textContent = turno;
            tr.appendChild(tdTurno);
        }

        // HORA
        const tdHora = document.createElement('td');
        tdHora.className = 'admin-td-time';
        tdHora.textContent = timeLabel;
        tr.appendChild(tdHora);

        // DÍAS
        if (idx === 6) {
            const td = document.createElement('td');
            td.colSpan = 6;
            td.className = 'bg-gray-100 text-center py-2 border border-gray-200';
            td.innerHTML = '<span class="text-xs font-extrabold text-gray-500 uppercase tracking-[0.4em]">☕ RECESO</span>';
            tr.appendChild(td);
        } else {
            DAYS.forEach(day => {
                if (idx === 0 && day.id === 'lunes') {
                    const td = document.createElement('td');
                    td.className = 'admin-td-slot occupied !bg-yellow-50';
                    td.innerHTML = `<span class="admin-slot-materia text-yellow-700" style="font-size: 0.65rem; font-weight: 900;">🇻🇪 ACTO CÍVICO</span>
                                    <span class="admin-slot-prof text-yellow-600 mt-1">Institucional</span>`;
                    tr.appendChild(td);
                    return;
                }

                const slot = db.getSlot(adminCareer, adminSemester, adminSection, day.id, idx);
                const td = document.createElement('td');
                td.className = `admin-td-slot ${slot ? 'occupied' : 'free'}`;

                if (slot) {
                    // ✅ MEJORA 3: botón de liberar slot visible al hacer hover
                    const btnFree = document.createElement('button');
                    btnFree.className = 'btn-admin-free';
                    btnFree.textContent = '✕ Liberar';
                    btnFree.onclick = async (e) => {
                        e.stopPropagation();
                        if (confirm(`¿Liberar "${slot.materia}" (${slot.prof}) del ${day.label} ${timeLabel}?`)) {
                            await db.free(adminCareer, adminSemester, adminSection, day.id, idx);
                            showToast(
                                `Slot liberado: <strong>${slot.materia}</strong>`,
                                `${day.label} · ${timeLabel} · ${slot.prof}`,
                                'warning'
                            );
                            renderAdminSchedule();
                        }
                    };

                    // Texto materia + prof + aula + botón
                    const materiaSpan = document.createElement('span');
                    materiaSpan.className = 'admin-slot-materia';
                    materiaSpan.textContent = slot.materia.toUpperCase();

                    const profSpan = document.createElement('span');
                    profSpan.className = 'admin-slot-prof';
                    profSpan.textContent = slot.prof;

                    const classSpan = document.createElement('span');
                    classSpan.className = 'text-[9px] font-normal opacity-80 mt-0.5 text-unefablue leading-tight';
                    classSpan.textContent = `📍 ${slot.classroom || 'Sin Aula'}`;

                    td.appendChild(materiaSpan);
                    td.appendChild(profSpan);
                    td.appendChild(classSpan);
                    td.appendChild(btnFree);

                    summaryRows.push({ day: day.label, time: timeLabel, prof: slot.prof, materia: slot.materia });
                }
                tr.appendChild(td);
            });
        }

        tbody.appendChild(tr);
    });

    // ═══════════════════════════════════════════════════════════
    // Tabla resumen AGRUPADA: un grupo por Materia+Docente
    // Columnas: MATERIA | DOCENTE | LUNES | MARTES | MIÉ | JUE | VIE
    // Cada celda de día muestra el rango horario consolidado (ej: 07:00→12:15)
    // ═══════════════════════════════════════════════════════════
    buildGroupedSummary(summaryBody);
}

/**
 * Agrupa todos los slots del semestre activo por (materia + prof),
 * calcula el rango de horas por día, y renderiza una fila por grupo.
 */
function buildGroupedSummary(summaryBody) {
    // groups[key] = { materia, prof, days: { lunes: [idx,...], ... } }
    const groups = {};

    TIME_SLOTS.forEach((_, idx) => {
        DAYS.forEach(day => {
            const slot = db.getSlot(adminCareer, adminSemester, adminSection, day.id, idx);
            if (!slot) return;
            const key = `${slot.materia}||${slot.prof}`;
            if (!groups[key]) {
                groups[key] = { materia: slot.materia, prof: slot.prof, days: {} };
                DAYS.forEach(d => { groups[key].days[d.id] = []; });
            }
            groups[key].days[day.id].push(idx);
        });
    });

    const entries = Object.values(groups);

    if (entries.length === 0) {
        summaryBody.innerHTML = `<tr><td colspan="8" class="admin-td-sm text-gray-400 py-8 text-center">Sin reservas registradas para este semestre.</td></tr>`;
        return;
    }

    // Ordenar alfabéticamente por materia
    entries.sort((a, b) => a.materia.localeCompare(b.materia));

    entries.forEach((group, rowIdx) => {
        const tr = document.createElement('tr');
        const isEven = rowIdx % 2 === 0;

        // ── Celda MATERIA ──
        const tdMateria = document.createElement('td');
        tdMateria.className = 'admin-td-sm text-left font-extrabold text-unefablue';
        tdMateria.textContent = group.materia.toUpperCase();
        tr.appendChild(tdMateria);

        // ── Celda DOCENTE ──
        const tdProf = document.createElement('td');
        tdProf.className = 'admin-td-sm text-left font-semibold text-gray-700 italic';
        tdProf.textContent = group.prof;
        tr.appendChild(tdProf);

        // ── Una celda por día ──
        DAYS.forEach(day => {
            const indices = [...group.days[day.id]].sort((a, b) => a - b);
            const td = document.createElement('td');
            td.className = 'admin-td-sm text-center';

            if (indices.length === 0) {
                // Sin clases ese día
                td.innerHTML = `<span class="text-gray-300 font-bold">—</span>`;
            } else {
                // Rango: primera hora de inicio → última hora de fin
                const startTime = TIME_SLOTS[indices[0]].split(' - ')[0];
                const endTime = TIME_SLOTS[indices[indices.length - 1]].split(' - ')[1];
                const slots = indices.length;
                td.innerHTML = `
                    <span class="block font-bold text-unefablue" style="font-size:0.62rem">${startTime}</span>
                    <span class="block text-gray-400" style="font-size:0.55rem">↓</span>
                    <span class="block font-bold text-unefablue" style="font-size:0.62rem">${endTime}</span>
                    <span class="block text-gray-400 mt-0.5" style="font-size:0.52rem">${slots} franja${slots > 1 ? 's' : ''}</span>
                `;
                td.style.backgroundColor = isEven ? '#f0f6ff' : '#dce8f5';
            }
            tr.appendChild(td);
        });

        summaryBody.appendChild(tr);
    });

    // Total footer
    const tfooter = document.createElement('tr');
    tfooter.innerHTML = `
        <td class="admin-td-sm font-extrabold text-unefablue text-left" colspan="2">
            TOTAL: ${entries.length} materia${entries.length > 1 ? 's' : ''} registrada${entries.length > 1 ? 's' : ''}
        </td>
        ${DAYS.map(day => {
        const count = entries.filter(g => g.days[day.id].length > 0).length;
        return `<td class="admin-td-sm font-bold text-gray-500">${count > 0 ? count + ' mat.' : '—'}</td>`;
    }).join('')}
    `;
    summaryBody.appendChild(tfooter);
}


// ═══════════════════════════ PDF ════════════════════════════════

btnDownloadPdf.addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;
    const zone = document.getElementById('pdf-capture-zone');

    btnDownloadPdf.innerHTML = '⏳ Generando...';
    btnDownloadPdf.disabled = true;

    const canvas = await html2canvas(zone, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    let imgW = pdfW - 20, imgH = imgW / ratio;
    if (imgH > pdfH - 20) { imgH = pdfH - 20; imgW = imgH * ratio; }

    pdf.addImage(img, 'PNG', (pdfW - imgW) / 2, 10, imgW, imgH);
    pdf.save(`Horario_${(CAREERS_MAP[adminCareer] || adminCareer).replace(/ /g, '_')}_${(SEMESTERS[+adminSemester] || '').replace(/ /g, '_')}.pdf`);

    btnDownloadPdf.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Descargar PDF`;
    btnDownloadPdf.disabled = false;
});

// ═══════════════════════════ RESET ══════════════════════════════

document.getElementById('btn-reset-all').addEventListener('click', async () => {
    if (confirm('¿Seguro que deseas RESETEAR todas las reservaciones?')) {
        await db.resetAll();
        if (adminCareer && adminSemester !== '') renderAdminSchedule();
        showToast('Sistema reseteado', 'Todas las reservaciones han sido eliminadas.', 'success');
    }
});

// ═══════════════════════════ REALTIME ═══════════════════════════
// Polling cada 30s para sincronizar con otros usuarios
setInterval(async () => {
    if (!currentUser) return;
    await db.fetchAll();
    if (currentUser.role === 'professor' && currentCareer && currentSemester !== '') renderGrid();
    if (currentUser.role === 'admin' && adminCareer && adminSemester !== '') renderAdminSchedule();
}, 30000);

// ══════════════════════════════════════════════════════════
// PERSONALIZACIÓN AVANZADA
// ══════════════════════════════════════════════════════════

// ── 1. Reloj en tiempo real ───────────────────────────────
(function initClock() {
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');
    const D = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    function tick() {
        const n = new Date();
        const h = String(n.getHours()).padStart(2,'0');
        const m = String(n.getMinutes()).padStart(2,'0');
        const s = String(n.getSeconds()).padStart(2,'0');
        timeEl.textContent = `${h}:${m}:${s}`;
        dateEl.textContent = `${D[n.getDay()]} ${n.getDate()} ${M[n.getMonth()]}`;
    }
    tick(); setInterval(tick, 1000);
})();

// ── 2. Modo Oscuro ────────────────────────────────────────
const btnDark = document.getElementById('btn-dark-mode');
if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark-mode');
    btnDark.textContent = '☀️';
}
btnDark.addEventListener('click', () => {
    const on = document.body.classList.toggle('dark-mode');
    btnDark.textContent = on ? '☀️' : '🌙';
    localStorage.setItem('dark-mode', on);
});

// ── 3. Partículas animadas en Login ───────────────────────
(function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const COLS = ['rgba(220,166,61,', 'rgba(10,48,102,', 'rgba(255,255,255,'];
    let particles = [];
    function resize() { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * canvas.width, y: Math.random() * canvas.height,
            r: Math.random() * 3 + 1,
            vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
            color: COLS[Math.floor(Math.random() * COLS.length)],
            alpha: Math.random() * 0.35 + 0.08,
        });
    }
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;  if (p.x > canvas.width)  p.x = 0;
            if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color + p.alpha + ')';
            ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    draw();
})();

// ── 4. Avatar con iniciales y color ──────────────────────
const AVATAR_COLORS = ['#0a3066','#7c3aed','#065f46','#b45309','#dc2626','#0891b2','#be185d'];
function strToColor(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function updateAvatar(name) {
    const el = document.getElementById('user-avatar-circle');
    if (!el) return;
    const initials = name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
    const color = strToColor(name);
    el.innerHTML = `<span style="font-size:1.5rem;font-weight:900;color:#fff;letter-spacing:-1px">${initials}</span>`;
    el.style.background = `linear-gradient(135deg,${color},${color}bb)`;
    el.style.borderColor = color;
}
// Avatar update is now handled in the main login handler

// ── 5. Temas por carrera ──────────────────────────────────
const THEMES = { sistemas: 'theme-sistemas', enfermeria: 'theme-enfermeria', administracion: 'theme-administracion' };
function applyTheme(career) {
    Object.values(THEMES).forEach(t => document.body.classList.remove(t));
    if (career && THEMES[career]) document.body.classList.add(THEMES[career]);
}
selectCareer.addEventListener('change', e => applyTheme(e.target.value));
document.getElementById('admin-select-career').addEventListener('change', e => applyTheme(e.target.value));

// ── 6. Barra de progreso ──────────────────────────────────
function updateProgressBar() {
    const wrap = document.getElementById('progress-bar-wrap');
    if (!wrap || !currentCareer || currentSemester === '') return;
    const prefix = `${currentCareer}__${currentSemester}__`;
    const total = ((TIME_SLOTS.length - 1) * DAYS.length) - 1; // Restamos 1 por la franja de receso y 1 acto cívico
    const occupied = Object.keys(db.getAll()).filter(k => k.startsWith(prefix)).length;
    const pct = Math.round((occupied / total) * 100);
    document.getElementById('progress-bar-fill').style.width = pct + '%';
    document.getElementById('progress-bar-pct').textContent = pct + '%';
    document.getElementById('progress-bar-label').textContent = `${occupied} / ${total} franjas ocupadas`;
    wrap.classList.remove('hidden');
}
// (progressbar se actualiza explícitamente en reserve/free handlers)

// ── 7. Nombre de extensión editable (doble clic) ─────────
function makeHeaderEditable(el) {
    el.contentEditable = 'true';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    function save() {
        el.contentEditable = 'false';
        localStorage.setItem('header-title', el.textContent.trim());
    }
    el.addEventListener('blur', save, { once: true });
    el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.textContent = localStorage.getItem('header-title') || 'UNEFA — EXTENSIÓN MARA'; el.blur(); }
    }, { once: true });
}
const _savedTitle = localStorage.getItem('header-title');
if (_savedTitle) { const el = document.getElementById('header-title-text'); if (el) el.textContent = _savedTitle; }

// ── 8. Sonido de confirmación ─────────────────────────────
function playConfirmSound() {
    try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        [[880, 0, 0.08], [1100, 0.1, 0.1]].forEach(([freq, t, dur]) => {
            const osc = ac.createOscillator(), g = ac.createGain();
            osc.connect(g); g.connect(ac.destination);
            osc.type = 'sine'; osc.frequency.value = freq;
            g.gain.setValueAtTime(0.12, ac.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + dur);
            osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + dur + 0.05);
        });
    } catch(e) {}
}
modalForm.addEventListener('submit', () => setTimeout(playConfirmSound, 80));

// ── 9. Skeleton loaders en la grilla ─────────────────────
function showSkeletonGrid() {
    scheduleBody.innerHTML = '';
    for (let r = 0; r < 7; r++) {
        const tr = document.createElement('tr');
        const tdT = document.createElement('td'); tdT.className = 'time-cell';
        tdT.innerHTML = '<div class="skeleton-cell" style="min-height:14px;border-radius:3px"></div>';
        tr.appendChild(tdT);
        DAYS.forEach(() => {
            const td = document.createElement('td'); td.className = 'slot-cell';
            td.innerHTML = '<div class="skeleton-cell"></div>';
            tr.appendChild(td);
        });
        scheduleBody.appendChild(tr);
    }
}


// ══════════════════════════════════════════════════════════
// TOP 4: NUEVAS FUNCIONALIDADES
// ══════════════════════════════════════════════════════════

// ── 1. DETECCIÓN DE CONFLICTOS ────────────────────────────
// Verifica si el profesor ya tiene ese día+hora en otra carrera/semestre
function checkConflict(dayId, slotIdx) {
    const all = db.getAll();
    const conflicts = [];
    Object.entries(all).forEach(([key, val]) => {
        if (val.prof !== currentUser.name) return;
        const parts = key.split('__');
        // key: career__sem__day__idx
        if (parts[2] === dayId && parseInt(parts[3]) === slotIdx) {
            const careerLabel = CAREERS_MAP[parts[0]] || parts[0];
            const semLabel = SEMESTERS[parseInt(parts[1])] || parts[1];
            conflicts.push(`${careerLabel} — ${semLabel} (${val.materia})`);
        }
    });
    return conflicts;
}

// Patch openModal to check conflicts first
const _origOpenModal = openModal;
window.openModal = function(dayId, slotIdx) {
    const conflicts = checkConflict(dayId, slotIdx);
    if (conflicts.length > 0) {
        showToast(
            `⚠️ Conflicto de horario detectado`,
            `Ya tienes: ${conflicts[0]}`,
            'warning', 5000
        );
        // Still allow reservation but warn
    }
    _origOpenModal(dayId, slotIdx);
};
// Re-wire slot buttons to use patched openModal
const _origRenderGrid = renderGrid;
window.renderGrid = function() {
    _origRenderGrid();
    // slot buttons already call openModal which is now window.openModal
    // but they reference the local variable, so we re-assign below
};

// ── 2. MI HORARIO (Vista del Profesor) ───────────────────
const btnMySchedule = document.getElementById('btn-my-schedule');

function renderMySchedule() {
    const all = db.getAll();
    const mySlots = Object.entries(all)
        .filter(([, v]) => v.prof === currentUser?.name)
        .map(([key, v]) => {
            const [career, sem, day, idx] = key.split('__');
            return {
                career: CAREERS_MAP[career] || career,
                sem: SEMESTERS[parseInt(sem)] || sem,
                day: DAYS.find(d => d.id === day)?.label || day,
                time: TIME_SLOTS[parseInt(idx)],
                materia: v.materia,
            };
        })
        .sort((a, b) => a.career.localeCompare(b.career) || a.day.localeCompare(b.day));

    const existing = document.getElementById('modal-my-schedule');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-my-schedule';
    modal.className = 'fixed inset-0 z-[998] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="my-schedule-overlay"></div>
        <div class="relative z-10 bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden animate-fade-in">
            <div class="bg-unefablue text-white px-6 py-4 flex justify-between items-center border-b-4 border-unefagold">
                <div>
                    <h3 class="font-extrabold text-lg">📅 Mi Horario Completo</h3>
                    <p class="text-blue-200 text-xs mt-0.5">${currentUser?.name} — ${mySlots.length} franja${mySlots.length !== 1 ? 's' : ''} reservada${mySlots.length !== 1 ? 's' : ''}</p>
                </div>
                <button id="close-my-schedule" class="text-white/60 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div class="p-4 max-h-[70vh] overflow-y-auto">
                ${mySlots.length === 0
                    ? '<p class="text-center text-gray-400 py-10 font-semibold">No tienes franjas reservadas aún.</p>'
                    : `<table class="w-full text-xs border-collapse">
                        <thead><tr>
                            <th class="admin-th-sm text-left">Carrera</th>
                            <th class="admin-th-sm text-left">Semestre</th>
                            <th class="admin-th-sm">Día</th>
                            <th class="admin-th-sm">Hora</th>
                            <th class="admin-th-sm text-left">Materia</th>
                        </tr></thead>
                        <tbody>${mySlots.map((s, i) => `
                            <tr class="${i % 2 === 0 ? '' : 'bg-blue-50'}">
                                <td class="admin-td-sm text-left font-semibold text-unefablue">${s.career}</td>
                                <td class="admin-td-sm text-left">${s.sem}</td>
                                <td class="admin-td-sm font-bold">${s.day}</td>
                                <td class="admin-td-sm text-gray-500">${s.time}</td>
                                <td class="admin-td-sm text-left font-bold">${s.materia}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>`
                }
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('close-my-schedule').onclick = () => modal.remove();
    document.getElementById('my-schedule-overlay').onclick = () => modal.remove();
}

if (btnMySchedule) btnMySchedule.addEventListener('click', renderMySchedule);

// Show "Mi Horario" button only for professors
const _origSetupProfessor = setupProfessor;
window.setupProfessor = function() {
    _origSetupProfessor();
    btnMySchedule?.classList.remove('hidden');
    btnMySchedule?.classList.add('flex');
};
const _origSetupAdmin = setupAdmin;
window.setupAdmin = function() {
    _origSetupAdmin();
    btnMySchedule?.classList.add('hidden');
};

// ── 3. ESTADÍSTICAS CON CHART.JS ─────────────────────────
let chartDay = null, chartCareer = null, chartProf = null;

function renderStats() {
    const all = db.getAll();
    const statsPanel = document.getElementById('stats-panel');
    statsPanel.classList.remove('hidden');
    statsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // -- Por día
    const byDay = {};
    DAYS.forEach(d => byDay[d.label] = 0);
    Object.keys(all).forEach(k => {
        const day = k.split('__')[2];
        const label = DAYS.find(d => d.id === day)?.label;
        if (label) byDay[label]++;
    });

    // -- Por carrera
    const byCareer = {};
    Object.keys(CAREERS_MAP).forEach(k => byCareer[CAREERS_MAP[k]] = 0);
    Object.keys(all).forEach(k => {
        const c = k.split('__')[0];
        const label = CAREERS_MAP[c];
        if (label) byCareer[label]++;
    });

    // -- Por docente (top 8)
    const byProf = {};
    Object.values(all).forEach(v => { byProf[v.prof] = (byProf[v.prof] || 0) + 1; });
    const profEntries = Object.entries(byProf).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const CHART_COLORS = ['#0a3066','#dca63d','#7c3aed','#065f46','#dc2626','#0891b2','#be185d','#b45309'];

    if (chartDay) chartDay.destroy();
    if (chartCareer) chartCareer.destroy();
    if (chartProf) chartProf.destroy();

    const defOpts = { responsive: true, plugins: { legend: { display: false } } };

    chartDay = new Chart(document.getElementById('chart-by-day'), {
        type: 'bar',
        data: {
            labels: Object.keys(byDay),
            datasets: [{ data: Object.values(byDay), backgroundColor: CHART_COLORS, borderRadius: 6 }],
        },
        options: { ...defOpts, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    });

    chartCareer = new Chart(document.getElementById('chart-by-career'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(byCareer),
            datasets: [{ data: Object.values(byCareer), backgroundColor: CHART_COLORS, borderWidth: 2 }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } },
    });

    chartProf = new Chart(document.getElementById('chart-by-prof'), {
        type: 'bar',
        data: {
            labels: profEntries.map(e => e[0]),
            datasets: [{ data: profEntries.map(e => e[1]), backgroundColor: CHART_COLORS, borderRadius: 6 }],
        },
        options: { ...defOpts, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    });
}

document.getElementById('btn-show-stats')?.addEventListener('click', renderStats);
document.getElementById('btn-close-stats')?.addEventListener('click', () => closeModal('modal-stats'));

// ══════════════════════════════════════════════════════════
// GESTIÓN DE USUARIOS
// ══════════════════════════════════════════════════════════

async function renderUsersPanel() {
    const panelUsers = document.getElementById('panel-users');
    if (panelUsers) {
        panelUsers.classList.remove('hidden');
        panelUsers.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    await userDB.fetchAll();
    const users = userDB.getAll();
    document.getElementById('user-count').textContent = users.length;

    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = users.map((u, i) => `
        <tr class="${i % 2 === 0 ? '' : 'bg-indigo-50/40'}">
            <td class="admin-td-sm text-left font-semibold text-unefablue">${u.name}</td>
            <td class="admin-td-sm text-left font-mono text-gray-600">${u.username}</td>
            <td class="admin-td-sm text-center">
                <span class="px-2 py-0.5 rounded-full text-white text-xs font-bold ${u.role === 'admin' ? 'bg-unefablue' : 'bg-emerald-500'}">
                    ${u.role === 'admin' ? 'Admin' : 'Profesor'}
                </span>
            </td>
            <td class="admin-td-sm text-center">
                ${u.role !== 'admin' ? `
                <button onclick="deleteUser('${u.username}')"
                    class="text-xs bg-red-50 hover:bg-red-600 hover:text-white text-red-500 border border-red-200 px-2 py-1 rounded-lg font-bold transition-all">
                    Eliminar
                </button>` : '<span class="text-gray-300 text-xs">—</span>'}
            </td>
        </tr>
    `).join('');
}

window.deleteUser = async function(username) {
    if (!confirm(`¿Eliminar la cuenta de "${username}"?`)) return;
    const ok = await userDB.remove(username);
    if (ok) {
        showToast('Cuenta eliminada', `Usuario "${username}" eliminado`, 'success');
        renderUsersPanel();
    } else {
        showToast('No se puede eliminar', 'El admin no puede ser eliminado', 'error');
    }
};

document.getElementById('btn-show-users')?.addEventListener('click', () => {
    openPanelModal('modal-users');
    renderUsersPanel();
});
document.getElementById('btn-close-users')?.addEventListener('click', () => closeModal('modal-users'));

document.getElementById('form-new-user')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = document.getElementById('new-user-name').value.trim();
    const username = document.getElementById('new-user-username').value.trim().toLowerCase();
    const password = document.getElementById('new-user-password').value;

    if (!name || !username || !password) return;

    const ok = await userDB.add(username, password, name);
    if (ok) {
        showToast('✅ Cuenta creada', `${name} (${username}) puede iniciar sesión`, 'success');
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-username').value = '';
        document.getElementById('new-user-password').value = '';
        renderUsersPanel();
    } else {
        showToast('Usuario ya existe', `"${username}" ya está registrado`, 'error');
    }
});

// ══════════════════════════════════════════════════════════
// GESTIÓN DE SECCIONES
// ══════════════════════════════════════════════════════════

document.getElementById('btn-show-sections')?.addEventListener('click', () => {
    openPanelModal('modal-sections');
    renderSectionsPanel();
});
document.getElementById('btn-close-sections')?.addEventListener('click', () => closeModal('modal-sections'));

// Poblar semestres en el formulario de nueva sección
document.getElementById('section-career')?.addEventListener('change', () => {
    const semSelect = document.getElementById('section-semester');
    semSelect.innerHTML = '<option value="" disabled selected>--</option>';
    SEMESTERS.forEach((s, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = s;
        semSelect.appendChild(o);
    });
});

async function renderSectionsPanel() {
    
    

    try {
        const res = await authFetch('/api/sections');
        const data = await res.json();
        const sections = data.sections || [];

        document.getElementById('section-count').textContent = sections.length;

        const tbody = document.getElementById('sections-table-body');
        if (sections.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-gray-400 text-sm">No hay secciones creadas aún</td></tr>';
            return;
        }

        tbody.innerHTML = sections.map(s => `
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="px-3 py-2.5 font-medium text-gray-800">${CAREERS_MAP[s.career] || s.career}</td>
                <td class="px-3 py-2.5 text-gray-600">${SEMESTERS[parseInt(s.semester)] || s.semester}</td>
                <td class="px-3 py-2.5"><span class="bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-mono text-xs font-bold">${s.code}</span></td>
                <td class="px-3 py-2.5 text-center">
                    <button onclick="deleteSection(${s.id})" class="text-red-500 hover:text-red-700 font-bold text-xs hover:underline">🗑️ Eliminar</button>
                </td>
            </tr>
        `).join('');
    } catch (e) { console.error('Error cargando secciones:', e); }
}

window.deleteSection = async function(id) {
    if (!confirm('¿Eliminar esta sección?')) return;
    try {
        const res = await authFetch(`/api/sections/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Sección eliminada', '', 'success');
            renderSectionsPanel();
        } else {
            showToast('Error', data.message, 'error');
        }
    } catch (e) { showToast('Error de conexión', '', 'error'); }
};

document.getElementById('form-new-section')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const career = document.getElementById('section-career').value;
    const semester = document.getElementById('section-semester').value;
    const code = document.getElementById('section-code').value.trim();

    if (!career || !semester || !code) return;

    try {
        const res = await authFetch('/api/sections', {
            method: 'POST',
            body: JSON.stringify({ career, semester, code })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Sección creada', `${code} — ${CAREERS_MAP[career]}`, 'success');
            document.getElementById('section-code').value = '';
            renderSectionsPanel();
        } else {
            showToast('Error', data.message, 'error');
        }
    } catch (e) { showToast('Error de conexión', '', 'error'); }
});

window.openPanelModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }
};

// ── Restaurar Sesión al Recargar ──
window.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwt_token');
    const userData = localStorage.getItem('user_data');
    
    if (token && userData) {
        try {
            currentUser = JSON.parse(userData);
            
            // Ocultar vistas de login/registro
            document.getElementById('login-section')?.classList.add('hidden');
            document.getElementById('register-section')?.classList.add('hidden');
            viewLogin.classList.add('hidden');
            
            // Cargar datos
            await db.fetchAll();
            
            // Configurar perfil
            document.getElementById('profile-name').textContent = currentUser.name;
            document.getElementById('profile-role').textContent = currentUser.role === 'admin' ? 'Administrador' : 'Docente Activo';
            if (typeof updateAvatar === 'function') updateAvatar(currentUser.name);
            
            // Mostrar dashboard
            viewDashboard.classList.remove('hidden');
            viewDashboard.classList.add('flex');
            
            document.getElementById('header-profile').classList.remove('hidden');
            document.getElementById('header-profile').classList.add('flex');

            currentUser.role === 'admin' ? setupAdmin() : setupProfessor();
            
            // Opcional: mostrar un pequeño toast silencioso (sin sonido, rápido)
            // showToast('Sesión restaurada', `Bienvenido, ${currentUser.name}`, 'info', 1500);
        } catch (e) {
            console.error('Error restaurando sesión:', e);
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('user_data');
        }
    }
});
