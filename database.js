/**
 * database.js — MySQL + Seguridad + Secciones
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// Configuración del Pool de Conexiones
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'unefa_scheduler',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDB() {
    // 1. Usuarios
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'professor'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Secciones
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            career VARCHAR(100) NOT NULL,
            semester INT NOT NULL,
            code VARCHAR(50) NOT NULL,
            UNIQUE KEY career_sem_code (career, semester, code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Reservaciones
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reservations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            \`key\` VARCHAR(255) NOT NULL UNIQUE,
            career VARCHAR(100) NOT NULL,
            semester INT NOT NULL,
            section VARCHAR(50) NOT NULL DEFAULT '',
            day VARCHAR(20) NOT NULL,
            slot_idx INT NOT NULL,
            prof VARCHAR(100) NOT NULL,
            materia VARCHAR(200) NOT NULL,
            classroom VARCHAR(100) NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // SEED: Usuario administrador inicial si la tabla está vacía
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    if (rows[0].cnt === 0) {
        const hashedPwd = await bcrypt.hash('123456', SALT_ROUNDS);
        await pool.query(
            'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
            ['Capitan', hashedPwd, 'Super Admin', 'admin']
        );
        console.log('🔒 Base de datos MySQL inicializada con usuario Admin.');
    }
}

// Inicializar tablas al cargar el módulo
initDB().catch(err => console.error('❌ Error al inicializar MySQL:', err));

const queries = {
    // ── Usuarios ──
    findByUsername: async (username) => {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0] || null;
    },
    getAllUsers: async () => {
        const [rows] = await pool.query('SELECT id, username, name, role FROM users ORDER BY role, name');
        return rows;
    },
    insertUser: async (username, password, name, role) => {
        return await pool.query('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [username, password, name, role]);
    },
    deleteUser: async (username, ignoreRole) => {
        const [result] = await pool.query('DELETE FROM users WHERE username = ? AND role != ?', [username, ignoreRole]);
        return { changes: result.affectedRows };
    },

    // ── Secciones ──
    getSections: async (career, semester) => {
        const [rows] = await pool.query('SELECT * FROM sections WHERE career = ? AND semester = ? ORDER BY code', [career, semester]);
        return rows;
    },
    getAllSections: async () => {
        const [rows] = await pool.query('SELECT * FROM sections ORDER BY career, semester, code');
        return rows;
    },
    insertSection: async (career, semester, code) => {
        return await pool.query('INSERT INTO sections (career, semester, code) VALUES (?, ?, ?)', [career, semester, code]);
    },
    deleteSection: async (id) => {
        const [result] = await pool.query('DELETE FROM sections WHERE id = ?', [id]);
        return { changes: result.affectedRows };
    },

    // ── Reservaciones ──
    getAllReservations: async () => {
        const [rows] = await pool.query('SELECT * FROM reservations');
        return rows;
    },
    getSlot: async (key) => {
        const [rows] = await pool.query('SELECT prof, materia, classroom FROM reservations WHERE key = ?', [key]);
        return rows[0] || null;
    },
    insertReservation: async (key, career, semester, section, day, slotIdx, prof, materia, classroom) => {
        return await pool.query(
            'INSERT INTO reservations (`key`, career, semester, section, day, slot_idx, prof, materia, classroom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [key, career, semester, section, day, slotIdx, prof, materia, classroom]
        );
    },
    deleteReservation: async (key) => {
        const [result] = await pool.query('DELETE FROM reservations WHERE `key` = ?', [key]);
        return { changes: result.affectedRows };
    },
    deleteAllReservations: async () => {
        return await pool.query('DELETE FROM reservations');
    },

    // ── Validaciones de Conflictos ──
    checkProfessorConflict: async (day, slotIdx, prof, key) => {
        const [rows] = await pool.query(
            'SELECT career, semester, section, materia, classroom FROM reservations WHERE day = ? AND slot_idx = ? AND prof = ? AND `key` != ? LIMIT 1',
            [day, slotIdx, prof, key]
        );
        return rows[0] || null;
    },
    checkClassroomConflict: async (day, slotIdx, classroom, key) => {
        const [rows] = await pool.query(
            'SELECT career, semester, section, materia, prof FROM reservations WHERE day = ? AND slot_idx = ? AND classroom = ? AND `key` != ? LIMIT 1',
            [day, slotIdx, classroom, key]
        );
        return rows[0] || null;
    },
};

module.exports = { pool, queries, bcrypt, SALT_ROUNDS };
