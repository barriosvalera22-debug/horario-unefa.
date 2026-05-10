/**
 * database.js — MySQL + SQLite Fallback + Seguridad + Secciones
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

let useSQLite = false;
let db = null;

// Initialize the SQLite instance synchronously in case of immediate query or fallback
try {
    const Database = require('better-sqlite3');
    db = new Database('unefa.db');
} catch (err) {
    console.error('❌ Error al inicializar SQLite:', err.message);
}

async function initDB() {
    try {
        console.log('🔄 Probando conexión con la base de datos MySQL en la nube...');
        // Test connection to MySQL
        const [testRows] = await pool.query('SELECT 1');
        console.log('✅ Conexión exitosa a la base de datos MySQL.');
        useSQLite = false;

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
    } catch (err) {
        console.warn('⚠️ No se pudo conectar a la base de datos MySQL en la nube. Detalles:', err.message);
        console.warn('🔄 Cambiando a base de datos local (SQLite) para mantener el sistema 100% operativo...');
        useSQLite = true;

        if (db) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'professor'
                );

                CREATE TABLE IF NOT EXISTS sections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    career TEXT NOT NULL,
                    semester INTEGER NOT NULL,
                    code TEXT NOT NULL,
                    UNIQUE (career, semester, code)
                );

                CREATE TABLE IF NOT EXISTS reservations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT NOT NULL UNIQUE,
                    career TEXT NOT NULL,
                    semester INTEGER NOT NULL,
                    section TEXT NOT NULL DEFAULT '',
                    day TEXT NOT NULL,
                    slot_idx INTEGER NOT NULL,
                    prof TEXT NOT NULL,
                    materia TEXT NOT NULL,
                    classroom TEXT NOT NULL DEFAULT ''
                );
            `);

            // SEED para SQLite
            const cnt = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
            if (cnt === 0) {
                const hashedPwd = bcrypt.hashSync('123456', SALT_ROUNDS);
                db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)').run(
                    'Capitan', hashedPwd, 'Super Admin', 'admin'
                );
                console.log('🔒 Base de datos SQLite inicializada con usuario Admin.');
            }
        }
    }
}

// Inicializar tablas al cargar el módulo
initDB().catch(err => console.error('❌ Error al inicializar:', err));

const queries = {
    // ── Usuarios ──
    findByUsername: async (username) => {
        if (useSQLite && db) {
            const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
            return row || null;
        }
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0] || null;
    },
    getAllUsers: async () => {
        if (useSQLite && db) {
            return db.prepare('SELECT id, username, name, role FROM users ORDER BY role, name').all();
        }
        const [rows] = await pool.query('SELECT id, username, name, role FROM users ORDER BY role, name');
        return rows;
    },
    insertUser: async (username, password, name, role) => {
        if (useSQLite && db) {
            const result = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)').run(
                username, password, name, role
            );
            return { changes: result.changes };
        }
        return await pool.query('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [
            username, password, name, role
        ]);
    },
    deleteUser: async (username, ignoreRole) => {
        if (useSQLite && db) {
            const result = db.prepare('DELETE FROM users WHERE username = ? AND role != ?').run(username, ignoreRole);
            return { changes: result.changes };
        }
        const [result] = await pool.query('DELETE FROM users WHERE username = ? AND role != ?', [username, ignoreRole]);
        return { changes: result.affectedRows };
    },

    // ── Secciones ──
    getSections: async (career, semester) => {
        if (useSQLite && db) {
            return db.prepare('SELECT * FROM sections WHERE career = ? AND semester = ? ORDER BY code').all(
                career, semester
            );
        }
        const [rows] = await pool.query('SELECT * FROM sections WHERE career = ? AND semester = ? ORDER BY code', [
            career, semester
        ]);
        return rows;
    },
    getAllSections: async () => {
        if (useSQLite && db) {
            return db.prepare('SELECT * FROM sections ORDER BY career, semester, code').all();
        }
        const [rows] = await pool.query('SELECT * FROM sections ORDER BY career, semester, code');
        return rows;
    },
    insertSection: async (career, semester, code) => {
        if (useSQLite && db) {
            const result = db.prepare('INSERT INTO sections (career, semester, code) VALUES (?, ?, ?)').run(
                career, semester, code
            );
            return { changes: result.changes };
        }
        return await pool.query('INSERT INTO sections (career, semester, code) VALUES (?, ?, ?)', [career, semester, code]);
    },
    deleteSection: async (id) => {
        if (useSQLite && db) {
            const result = db.prepare('DELETE FROM sections WHERE id = ?').run(id);
            return { changes: result.changes };
        }
        const [result] = await pool.query('DELETE FROM sections WHERE id = ?', [id]);
        return { changes: result.affectedRows };
    },

    // ── Reservaciones ──
    getAllReservations: async () => {
        if (useSQLite && db) {
            return db.prepare('SELECT * FROM reservations').all();
        }
        const [rows] = await pool.query('SELECT * FROM reservations');
        return rows;
    },
    getSlot: async (key) => {
        if (useSQLite && db) {
            const row = db.prepare('SELECT prof, materia, classroom FROM reservations WHERE key = ?').get(key);
            return row || null;
        }
        const [rows] = await pool.query('SELECT prof, materia, classroom FROM reservations WHERE `key` = ?', [key]);
        return rows[0] || null;
    },
    insertReservation: async (key, career, semester, section, day, slotIdx, prof, materia, classroom) => {
        if (useSQLite && db) {
            const result = db.prepare(
                'INSERT INTO reservations (key, career, semester, section, day, slot_idx, prof, materia, classroom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(key, career, semester, section, day, slotIdx, prof, materia, classroom);
            return { changes: result.changes };
        }
        return await pool.query(
            'INSERT INTO reservations (`key`, career, semester, section, day, slot_idx, prof, materia, classroom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [key, career, semester, section, day, slotIdx, prof, materia, classroom]
        );
    },
    deleteReservation: async (key) => {
        if (useSQLite && db) {
            const result = db.prepare('DELETE FROM reservations WHERE key = ?').run(key);
            return { changes: result.changes };
        }
        const [result] = await pool.query('DELETE FROM reservations WHERE `key` = ?', [key]);
        return { changes: result.affectedRows };
    },
    deleteAllReservations: async () => {
        if (useSQLite && db) {
            const result = db.prepare('DELETE FROM reservations').run();
            return { changes: result.changes };
        }
        return await pool.query('DELETE FROM reservations');
    },

    // ── Validaciones de Conflictos ──
    checkProfessorConflict: async (day, slotIdx, prof, key) => {
        if (useSQLite && db) {
            const row = db.prepare(
                'SELECT career, semester, section, materia, classroom FROM reservations WHERE day = ? AND slot_idx = ? AND prof = ? AND key != ? LIMIT 1'
            ).get(day, slotIdx, prof, key);
            return row || null;
        }
        const [rows] = await pool.query(
            'SELECT career, semester, section, materia, classroom FROM reservations WHERE day = ? AND slot_idx = ? AND prof = ? AND `key` != ? LIMIT 1',
            [day, slotIdx, prof, key]
        );
        return rows[0] || null;
    },
    checkClassroomConflict: async (day, slotIdx, classroom, key) => {
        if (useSQLite && db) {
            const row = db.prepare(
                'SELECT career, semester, section, materia, prof FROM reservations WHERE day = ? AND slot_idx = ? AND classroom = ? AND key != ? LIMIT 1'
            ).get(day, slotIdx, classroom, key);
            return row || null;
        }
        const [rows] = await pool.query(
            'SELECT career, semester, section, materia, prof FROM reservations WHERE day = ? AND slot_idx = ? AND classroom = ? AND `key` != ? LIMIT 1',
            [day, slotIdx, classroom, key]
        );
        return rows[0] || null;
    },
};

module.exports = { pool, queries, bcrypt, SALT_ROUNDS };
