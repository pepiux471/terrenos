const express = require('express');
const sql = require('mssql');
const router = express.Router();
 
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};
 
// Endpoint para el login del administrador
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
 
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT * FROM Administradores WHERE NombreUsuario = @username');
 
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }
 
        const admin = result.recordset[0];
        if (admin.Contraseña !== password) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
 
        res.json({ message: 'Login exitoso', admin: { id: admin.IdAdmin, username: admin.NombreUsuario, email: admin.Email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});
 
module.exports = router;