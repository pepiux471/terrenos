const express = require('express');
const sql = require('mssql');
const path = require('path');
const cors = require('cors');
const adminRoutes = require('./adminlogin'); // Importar el router de adminlogin
const app = express();

const dbConfig = {
  user: process.env.DB_USER || 'proyectoterrenos-server-admin',
  password: process.env.DB_PASSWORD || 'woz9$PnJxIqFO25Q',
  server: process.env.DB_HOST || 'proyectoterrenos-server.database.windows.net',
  database: process.env.DB_NAME || 'TerrenosDB',
  options: {
    encrypt: true, // Siempre habilitado para Azure SQL
    trustServerCertificate: false, // Deshabilitar en producción
    port: 1433
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Variable global para el pool de conexiones
let pool;
let isConnecting = false;

async function initializeDatabase(retries = 10, delay = 5000) {
  if (isConnecting) return;
  isConnecting = true;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Intentando conectar a la base de datos (intento ${i + 1})...`);
      pool = new sql.ConnectionPool(dbConfig);
      pool.on('error', err => {
        console.error('❌ Error en el pool de conexiones:', err.message);
        reconnectDatabase();
      });
      await pool.connect();
      console.log('✅ Conectado a la base de datos');
      isConnecting = false;
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

async function reconnectDatabase(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Intento de reconexión ${i + 1}/${retries}...`);
      if (pool && pool.connected) {
        await pool.close();
      }
      pool = new sql.ConnectionPool(dbConfig);
      await pool.connect();
      console.log('✅ Reconexión exitosa');
      return pool;
    } catch (err) {
      console.error(`❌ Error en intento ${i + 1}:`, err.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error('🚨 No se pudo reconectar después de varios intentos');
}

// Middleware para verificar conexión a BD
app.use(async (req, res, next) => {
  try {
    if (!pool || !pool.connected) {
      await initializeDatabase();
    }
    next();
  } catch (err) {
    console.error('❌ Error en middleware de conexión:', err.message);
    res.status(503).json({ 
      error: 'Servicio no disponible', 
      message: 'Error al conectar con la base de datos',
      details: err.message
    });
  }
});

// Resto de middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Usar las rutas de adminlogin
app.use('/api/admin', adminRoutes);

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔹 Login de administrador
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  // Simulación básica de autenticación (reemplazar con lógica real, e.g., consulta a BD)
  if (username === 'admin' && password === 'admin123') {
    res.json({ success: true, message: 'Inicio de sesión exitoso' });
  } else {
    res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
  }
});

// 🔹 Obtener todos los terrenos
app.get('/api/terrains', async (req, res) => {
  try {
    const result = await pool.request()
      .query('SELECT id, size_m2, price, status FROM dbo.terrains ORDER BY id');
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
      .query('SELECT id, size_m2, price, status FROM dbo.terrains WHERE id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Terreno no encontrado' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ Error al obtener terreno:', err.message, err.stack);
    res.status(500).json({ error: 'Error al conectar con la base de datos', details: err.message });
  }
});

// 🔹 Actualizar un terreno
app.put('/api/terrain/:id', async (req, res) => {
  try {
    const { size_m2, price, status } = req.body;
    if (!size_m2 || !price || !status) {
      return res.status(400).json({ success: false, error: 'Los campos size_m2, price y status son obligatorios' });
    }

    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('size_m2', sql.Decimal(10,2), size_m2)
      .input('price', sql.Decimal(10,2), price)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE dbo.terrains 
        SET size_m2 = @size_m2, price = @price, status = @status 
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, error: 'Terreno no encontrado' });
    }

    res.json({ success: true, message: 'Terreno actualizado exitosamente' });
  } catch (err) {
    console.error('❌ Error al actualizar terreno:', err.message, err.stack);
    res.status(500).json({ success: false, error: 'Error al actualizar terreno', details: err.message });
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
      .query('SELECT id FROM dbo.terrains WHERE id = @id');

    if (checkResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Terreno no encontrado' });
    }

    // Verificar si hay reservas asociadas
    const reservationCheck = await transaction.request()
      .input('terrainId', sql.NVarChar, req.params.id)
      .query('SELECT id FROM dbo.reservations WHERE terrain_id = @terrainId AND payment_status = \'pending\'');

    if (reservationCheck.recordset.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se puede eliminar un terreno con reservas pendientes' });
    }

    // Eliminar el terreno
    await transaction.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM dbo.terrains WHERE id = @id');

    await transaction.commit();
    res.json({ success: true, message: 'Terreno eliminado exitosamente' });
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Error al eliminar terreno:', err.message, err.stack);
    res.status(500).json({ error: 'Error al conectar con la base de datos', details: err.message });
  }
});

// Modificar la función reserveTerrain en apartado.html
async function reserveTerrain(terrainId, paypalDetails) {
    const formData = new FormData(document.getElementById('reserveForm'));
    const paymentOption = document.querySelector('input[name="paymentOption"]:checked').value;
    const terrain = geojsonData.features.find(f => f.properties.id === terrainId);
    
    // Calcular montos según el tipo de pago
    let payment_amount, total_amount, payments_total, payments_made;
    
    if (paymentOption === 'noDownPayment') {
        // Sin enganche: 135 pagos del precio completo
        total_amount = terrain.properties.price;
        payments_total = 135;
        payments_made = 1;
        payment_amount = Math.round(total_amount / payments_total);
    } else {
        // Con enganche: 2 pagos iniciales + 135 pagos con 5% descuento
        total_amount = terrain.properties.price * 0.95; // 5% de descuento
        payments_total = 137;
        payments_made = 2;
        payment_amount = Math.round(terrain.properties.price * 0.05); // Enganche del 5%
    }

    const payload = {
        terrain_id: terrainId,
        customer_name: formData.get('customer_name'),
        customer_email: formData.get('customer_email'),
        customer_phone: formData.get('customer_phone'),
        payment_reference: paypalDetails.id,
        payment_amount: payment_amount,
        deposit_type: paymentOption === 'noDownPayment' ? 'without_deposit' : 'with_deposit',
        total_amount: total_amount,
        payments_total: payments_total,
        payments_made: payments_made
    };

    console.log('Enviando reserva:', payload);

    try {
        const response = await fetch('/api/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('statusMessage').style.display = 'block';
            document.getElementById('statusMessage').textContent = 'Terreno reservado exitosamente!';
            document.getElementById('downloadTicket').style.display = 'block';
            document.getElementById('downloadTicket').onclick = () => generateReservationTicket(result.reservationId);
            
            // Actualizar el mapa
            const feature = geojsonData.features.find(f => f.properties.id === terrainId);
            if (feature) {
                feature.properties.status = 'reserved';
                createMapLayer();
                disableReservationForm();
            }
        } else {
            alert(result.message || 'Error al reservar el terreno. Intenta de nuevo.');
            document.getElementById('reserveButton').style.display = 'block';
        }
    } catch (error) {
        console.error('Error en la reserva:', error);
        alert('Error en el servidor. Intenta de nuevo.');
        document.getElementById('reserveButton').style.display = 'block';
    }
}

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
      .query('SELECT id, status FROM dbo.terrains WHERE id = @id');

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
      .query('UPDATE dbo.terrains SET status = \'reserved\' WHERE id = @id');

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
      INSERT INTO dbo.reservations (
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
        FROM dbo.reservations
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
        FROM dbo.reservations 
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
      .query('SELECT terrain_id, payment_status FROM dbo.reservations WHERE id = @id');

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
      .query('UPDATE dbo.reservations SET payment_status = \'cancelled\' WHERE id = @id');

    // Actualizar el terreno a disponible
    await transaction.request()
      .input('terrainId', sql.NVarChar, terrainId)
      .query('UPDATE dbo.terrains SET status = \'available\' WHERE id = @terrainId');

    await transaction.commit();

    res.json({ success: true, message: 'Reserva cancelada exitosamente' });
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Error al cancelar reserva:', err.message, err.stack);
    res.status(500).json({ error: 'Error al cancelar la reserva', details: err.message });
  }
});

// 🔹 Buscar reserva por payment_reference o correo (DESHABILITADO)
// /*
app.get('/api/reservation/search', async (req, res) => {
  try {
    const { query } = req.query;
    console.log(`🔍 Buscando reserva con query: ${query}`);
    const result = await pool.request()
      .input('query', sql.NVarChar, query)
      .query(`
        SELECT r.id, r.terrain_id, r.customer_name, r.customer_email, 
               r.customer_phone, r.payment_reference, r.payment_amount,
               r.deposit_type, r.payment_status, r.total_amount, r.payments_made, r.created_at,
               (CASE WHEN r.deposit_type = 'with_deposit' THEN 137 - r.payments_made ELSE 135 - r.payments_made END) AS payments_pending
        FROM dbo.reservations r
        LEFT JOIN dbo.payments p ON r.id = p.reservation_id
        WHERE r.payment_reference = @query 
           OR p.payment_reference = @query 
           OR r.customer_email = @query
      `);
    
    if (result.recordset.length === 0) {
      console.error(`❌ No se encontró reserva para query: ${query}`);
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    console.log(`✅ Reserva encontrada: ${JSON.stringify(result.recordset[0])}`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ Error al buscar reserva:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Error al buscar reserva', details: err.message });
  }
});
// */

// 🔹 Crear un pago
app.post('/api/payments', async (req, res) => {
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    const { reservation_id, amount, payment_reference } = req.body;
    
    if (!reservation_id || !amount || !payment_reference) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Los campos reservation_id, amount y payment_reference son obligatorios' });
    }

    // Verificar pagos pendientes
    const reservation = await transaction.request()
      .input('reservation_id', sql.Int, reservation_id)
      .query(`
        SELECT payments_made, 
               (CASE WHEN deposit_type = 'with_deposit' THEN 137 - payments_made ELSE 135 - payments_made END) AS payments_pending
        FROM dbo.reservations 
        WHERE id = @reservation_id
      `);
    
    if (reservation.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    if (reservation.recordset[0].payments_pending <= 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No hay pagos pendientes' });
    }

    // Insertar pago
    const result = await transaction.request()
      .input('reservation_id', sql.Int, reservation_id)
      .input('amount', sql.Decimal(10,2), amount)
      .input('payment_reference', sql.NVarChar, payment_reference)
      .input('created_at', sql.DateTime, new Date())
      .query(`
        INSERT INTO dbo.payments (reservation_id, amount, payment_reference, created_at)
        OUTPUT INSERTED.id
        VALUES (@reservation_id, @amount, @payment_reference, @created_at);
        UPDATE dbo.reservations 
        SET payments_made = payments_made + 1 
        WHERE id = @reservation_id;
      `);

    await transaction.commit();

    const response = { 
      success: true, 
      message: 'Pago procesado exitosamente', 
      paymentId: result.recordset[0].id, 
      reservation_id: parseInt(reservation_id)
    };
    console.log(`✅ Pago creado: ${JSON.stringify(response)}`);
    res.json(response);
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Error al procesar pago:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Error al procesar pago', details: err.message });
  }
});

// 🔹 Obtener pagos por reserva
app.get('/api/payments/:reservation_id', async (req, res) => {
  try {
    const { reservation_id } = req.params;
    const id = parseInt(reservation_id);
    if (isNaN(id) || id <= 0) {
      console.error(`❌ ID de reserva inválido: ${reservation_id}`);
      return res.status(400).json({ success: false, message: 'ID de reserva inválido' });
    }
    const result = await pool.request()
      .input('reservation_id', sql.Int, id)
      .query(`
        SELECT id, amount, payment_reference, created_at 
        FROM dbo.payments 
        WHERE reservation_id = @reservation_id
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ Error al obtener pagos:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Error al obtener pagos', details: err.message });
  }
});

// 🔹 Obtener un pago específico
app.get('/api/payment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const paymentId = parseInt(id);
    if (isNaN(paymentId) || paymentId <= 0) {
      console.error(`❌ ID de pago inválido: ${id}`);
      return res.status(400).json({ success: false, message: 'ID de pago inválido' });
    }
    const result = await pool.request()
      .input('id', sql.Int, paymentId)
      .query(`
        SELECT id, reservation_id, amount, payment_reference, created_at 
        FROM dbo.payments 
        WHERE id = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ Error al obtener pago:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Error al obtener pago', details: err.message });
  }
});

// Ruta de verificación de salud
app.get('/health', async (req, res) => {
  try {
    await pool.request().query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// Manejo de errores global
process.on('unhandledRejection', err => {
  console.error('⚠️ Unhandled Rejection:', err.message);
  if (err.code === 'ETIMEOUT' || err.code === 'ESOCKET') {
    reconnectDatabase();
  }
});

// Inicialización del servidor
const port = process.env.PORT || 3000;
initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${port}`);
  });
}).catch(err => {
  console.error('❌ Error fatal al iniciar la app:', err.message, err.stack);
});