const express = require('express');
const sql = require('mssql');
const path = require('path');
const app = express();
const port = 3000;
const adminRoutes = require('./adminlogin');

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

// Pool de conexiones global
let pool;

async function initializeDatabase(retries = 10, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Intentando conectar a la base de datos (intento ${i + 1})...`);
      pool = await sql.connect(dbConfig);
      console.log('✅ Conectado a la base de datos');
      return;
    } catch (err) {
      console.error(`❌ Error al conectar (intento ${i + 1}):`, err.message, err.stack);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error('🚨 No se pudo conectar a la base de datos después de varios intentos.');
      }
    }
  }
}

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Ruta login
app.use('/api/admin', adminRoutes);

// 🔹 Obtener todos los terrenos
app.get('/api/terrains', async (req, res) => {
  try {
    const result = await pool.request()
      .query('SELECT id, size_m2, price, status FROM terrains ORDER BY id');
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ Error al obtener terrenos:', err.message, err.stack);
    res.status(500).json({ error: 'Error al conectar con la base de datos', details: err.message });
  }
});

// 🔹 Obtener un terreno específico
app.get('/api/terrain/:id', async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('SELECT id, size_m2, price, status FROM terrains WHERE id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Terreno no encontrado' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ Error al obtener terreno:', err.message, err.stack);
    res.status(500).json({ error: 'Error al conectar con la base de datos', details: err.message });
  }
});

// 🔹 Actualizar un terreno específico
app.put('/api/terrain/:id', async (req, res) => {
  try {
    const { size_m2, price, status } = req.body;

    if (!size_m2 || !price || !status) {
      return res.status(400).json({ error: 'Todos los campos (size_m2, price, status) son obligatorios' });
    }

    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('size_m2', sql.Float, size_m2)
      .input('price', sql.Float, price)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE terrains 
        SET size_m2 = @size_m2, price = @price, status = @status
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Terreno no encontrado' });
    }

    res.json({ success: true, message: 'Terreno actualizado exitosamente' });
  } catch (err) {
    console.error('❌ Error al actualizar terreno:', err.message, err.stack);
    res.status(500).json({ error: 'Error al conectar con la base de datos', details: err.message });
  }
});

// 🔹 Eliminar un terreno
app.delete('/api/terrain/:id', async (req, res) => {
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Verificar si el terreno existe
    const checkResult = await transaction.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('SELECT id FROM terrains WHERE id = @id');

    if (checkResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Terreno no encontrado' });
    }

    // Verificar si hay reservas asociadas
    const reservationCheck = await transaction.request()
      .input('terrainId', sql.NVarChar, req.params.id)
      .query('SELECT id FROM reservations WHERE terrain_id = @terrainId AND payment_status = \'pending\'');

    if (reservationCheck.recordset.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se puede eliminar un terreno con reservas pendientes' });
    }

    // Eliminar el terreno
    await transaction.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM terrains WHERE id = @id');

    await transaction.commit();
    res.json({ success: true, message: 'Terreno eliminado exitosamente' });
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Error al eliminar terreno:', err.message, err.stack);
    res.status(500).json({ error: 'Error al conectar con la base de datos', details: err.message });
  }
});

// 🔹 Crear una reserva
app.post('/api/reservations', async (req, res) => {
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();

    const { terrain_id, customer_name, customer_email, customer_phone, payment_reference, payment_amount, deposit_type } = req.body;

    if (!terrain_id || !customer_name || !customer_email || !customer_phone || !payment_amount || !deposit_type) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Los campos terrain_id, customer_name, customer_email, customer_phone, payment_amount y deposit_type son obligatorios' });
    }

    const checkResult = await transaction.request()
      .input('id', sql.NVarChar, terrain_id)
      .query('SELECT id, status FROM terrains WHERE id = @id');

    if (checkResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Terreno no encontrado' });
    }

    const currentStatus = checkResult.recordset[0].status;
    if (currentStatus !== 'available') {
      await transaction.rollback();
      const statusText = currentStatus === 'reserved' ? 'reservado' : 'vendido';
      return res.status(400).json({ success: false, message: `Este terreno ya está ${statusText}` });
    }

    // Actualizar terreno a reservado
    await transaction.request()
      .input('id', sql.NVarChar, terrain_id)
      .query('UPDATE terrains SET status = \'reserved\' WHERE id = @id');

    // Insertar datos del cliente en reservations
    console.log('📝 Insertando reserva con:', { terrain_id, customer_name, customer_email, customer_phone, payment_reference, payment_amount, deposit_type });

    const request = transaction.request()
      .input('terrain_id', sql.NVarChar, terrain_id)
      .input('customer_name', sql.NVarChar, customer_name)
      .input('customer_email', sql.NVarChar, customer_email)
      .input('customer_phone', sql.NVarChar, customer_phone)
      .input('payment_reference', sql.NVarChar, payment_reference || null)
      .input('payment_amount', sql.Decimal(10,2), payment_amount)
      .input('deposit_type', sql.NVarChar, deposit_type)
      .input('payment_status', sql.NVarChar, 'pending')
      .input('created_at', sql.DateTime, new Date());

    const result = await request.query(`
      INSERT INTO reservations (
        terrain_id, 
        customer_name, 
        customer_email, 
        customer_phone, 
        payment_reference, 
        payment_amount,
        deposit_type,
        payment_status, 
        created_at,
        updated_at
      ) OUTPUT INSERTED.id
      VALUES (
        @terrain_id, 
        @customer_name, 
        @customer_email, 
        @customer_phone, 
        @payment_reference, 
        @payment_amount,
        @deposit_type,
        @payment_status, 
        @created_at,
        @created_at
      )
    `);

    const reservationId = result.recordset[0].id;

    await transaction.commit();

    res.json({ success: true, message: 'Terreno reservado exitosamente', reservationId });

  } catch (err) {
    await transaction.rollback();
    console.error('❌ Error al reservar terreno:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Error interno del servidor', details: err.message });
  }
});

// 🔹 Obtener todas las reservas
app.get('/api/reservations', async (req, res) => {
  try {
    // Verificar si la tabla reservations existe
    const tableCheck = await pool.request()
      .query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'reservations'
      `);
    
    if (tableCheck.recordset.length === 0) {
      console.error('❌ Tabla reservations no encontrada');
      return res.status(500).json({ error: 'La tabla reservations no existe en la base de datos' });
    }

    const result = await pool.request()
      .query(`
        SELECT id, terrain_id, customer_name, customer_email, 
               customer_phone, payment_reference, payment_amount,
               deposit_type, payment_status, created_at
        FROM reservations
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ Error al obtener reservas:', err.message, err.stack);
    res.status(500).json({ error: 'Error al consultar las reservas', details: err.message });
  }
});

// 🔹 Obtener una reserva específica
app.get('/api/reservation/:id', async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT id, terrain_id, customer_name, customer_email, 
               customer_phone, payment_reference, payment_amount,
               deposit_type, payment_status, created_at
        FROM reservations 
        WHERE id = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ Error al obtener reserva:', err.message, err.stack);
    res.status(500).json({ error: 'Error al consultar la reserva', details: err.message });
  }
});

// 🔹 Cancelar una reserva
app.post('/api/reservation/:id', async (req, res) => {
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const { status } = req.body;

    if (status !== 'cancelled') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Solo se permite cancelar reservas' });
    }

    // Obtener el terrain_id y payment_status de la reserva
    const reservationResult = await transaction.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT terrain_id, payment_status FROM reservations WHERE id = @id');

    if (reservationResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (reservationResult.recordset[0].payment_status === 'cancelled') {
      await transaction.rollback();
      return res.status(400).json({ error: 'La reserva ya está cancelada' });
    }

    const terrainId = reservationResult.recordset[0].terrain_id;

    // Actualizar la reserva a cancelada
    await transaction.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE reservations SET payment_status = \'cancelled\' WHERE id = @id');

    // Actualizar el terreno a disponible
    await transaction.request()
      .input('terrainId', sql.NVarChar, terrainId)
      .query('UPDATE terrains SET status = \'available\' WHERE id = @terrainId');

    await transaction.commit();

    res.json({ success: true, message: 'Reserva cancelada exitosamente' });
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Error al cancelar reserva:', err.message, err.stack);
    res.status(500).json({ error: 'Error al cancelar la reserva', details: err.message });
  }
});

// 🔸 Inicializar servidor SOLO después de conectar a la BD
initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
  });
}).catch(err => {
  console.error('❌ Error fatal al iniciar la app:', err.message, err.stack);
});