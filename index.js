/**
 * server.js — Servidor Express con Seguridad + Secciones (MySQL Version)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { queries, bcrypt, SALT_ROUNDS } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || ('unefa-mara-2026-secretkey-' + Math.random().toString(36).slice(2));
const JWT_EXPIRES = '8h';

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '🔒 Acceso denegado. Token requerido.' });
    }
    try {
        req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: '🔒 Token inválido o expirado.' });
    }
}

async function adminRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '🔒 Acceso denegado.' });
    }
    try {
        const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ success: false, message: '🚫 Solo administradores.' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: '🔒 Token inválido.' });
    }
}

// ═══════════════════════════════════════════════════════════
// API: AUTENTICACIÓN (públicas)
// ═══════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Faltan credenciales.' });

    try {
        const user = await queries.findByUsername(username);
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        const token = jwt.sign({ username: user.username, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        res.json({ success: true, token, user: { username: user.username, name: user.name, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password || !name) return res.status(400).json({ success: false, message: 'Faltan datos.' });
    if (password.length < 4) return res.status(400).json({ success: false, message: 'Contraseña muy corta.' });

    try {
        if (await queries.findByUsername(username)) {
            return res.status(409).json({ success: false, message: `"${username}" ya está registrado.` });
        }

        const hashed = await bcrypt.hash(password, SALT_ROUNDS);
        await queries.insertUser(username, hashed, name, 'professor');
        
        const token = jwt.sign({ username, name, role: 'professor' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        res.json({ success: true, token, user: { username, name, role: 'professor' } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al crear cuenta.' });
    }
});

// ═══════════════════════════════════════════════════════════
// API: USUARIOS (admin only)
// ═══════════════════════════════════════════════════════════

app.get('/api/users', adminRequired, async (req, res) => {
    try {
        const users = await queries.getAllUsers();
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/users', adminRequired, async (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password || !name) return res.status(400).json({ success: false, message: 'Faltan datos.' });

    try {
        if (await queries.findByUsername(username)) return res.status(409).json({ success: false, message: `"${username}" ya existe.` });
        const hashed = await bcrypt.hash(password, SALT_ROUNDS);
        await queries.insertUser(username, hashed, name, 'professor');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al crear usuario.' });
    }
});

app.delete('/api/users/:username', adminRequired, async (req, res) => {
    try {
        const result = await queries.deleteUser(req.params.username, 'admin');
        if (result.changes === 0) return res.status(400).json({ success: false, message: 'No se puede eliminar.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ═══════════════════════════════════════════════════════════
// API: SECCIONES
// ═══════════════════════════════════════════════════════════

app.get('/api/sections', authRequired, async (req, res) => {
    const { career, semester } = req.query;
    try {
        let sections;
        if (career && semester !== undefined) {
            sections = await queries.getSections(career, semester);
        } else {
            sections = await queries.getAllSections();
        }
        res.json({ success: true, sections });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/sections', adminRequired, async (req, res) => {
    const { career, semester, code } = req.body;
    if (!career || semester === undefined || !code) {
        return res.status(400).json({ success: false, message: 'Faltan datos.' });
    }
    try {
        await queries.insertSection(career, semester, code.trim());
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: `Sección "${code}" ya existe.` });
        }
        res.status(500).json({ success: false, message: 'Error al crear sección.' });
    }
});

app.delete('/api/sections/:id', adminRequired, async (req, res) => {
    try {
        const result = await queries.deleteSection(parseInt(req.params.id));
        if (result.changes === 0) return res.status(404).json({ success: false, message: 'No encontrada.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ═══════════════════════════════════════════════════════════
// API: RESERVACIONES
// ═══════════════════════════════════════════════════════════

app.get('/api/reservations', authRequired, async (req, res) => {
    try {
        const rows = await queries.getAllReservations();
        const obj = {};
        rows.forEach(r => { obj[r.key] = { prof: r.prof, materia: r.materia, classroom: r.classroom }; });
        res.json({ success: true, reservations: obj });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/reservations', authRequired, async (req, res) => {
    const { career, semester, section, day, slotIdx, prof, materia, classroom } = req.body;
    const key = `${career}__${semester}__${section}__${day}__${slotIdx}`;

    try {
        if (await queries.getSlot(key)) return res.status(409).json({ success: false, message: 'Espacio ocupado.' });

        const profConflict = await queries.checkProfessorConflict(day, slotIdx, prof, key);
        if (profConflict) return res.status(409).json({ success: false, message: `Conflicto con profesor en ${profConflict.career.toUpperCase()} (Sección: ${profConflict.section}).` });

        if (classroom.trim() !== '') {
            const classConflict = await queries.checkClassroomConflict(day, slotIdx, classroom.trim(), key);
            if (classConflict) return res.status(409).json({ success: false, message: `Aula "${classroom}" ocupada por ${classConflict.career.toUpperCase()} (Sección: ${classConflict.section}).` });
        }

        await queries.insertReservation(key, career, semester, section, day, slotIdx, prof, materia, classroom.trim());
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al reservar.' });
    }
});

app.delete('/api/reservations/slot/:key', authRequired, async (req, res) => {
    try {
        const result = await queries.deleteReservation(req.params.key);
        res.json({ success: true, freed: result.changes > 0 });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.delete('/api/reservations/reset/all', adminRequired, async (req, res) => {
    try {
        await queries.deleteAllReservations();
        res.json({ success: true, message: 'Todas las reservaciones eliminadas.' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ═══════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║   🎓 UNEFA — Sistema de Gestión de Horarios  ║');
    console.log('  ║           Ampliación Mara — MYSQL            ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║   🌐 Servidor:  http://localhost:${PORT}        ║`);
    console.log(`  ║   🗄️  Base datos: ${process.env.DB_NAME}             ║`);
    console.log('  ║   🔒 Seguridad: bcrypt + JWT                 ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
});
