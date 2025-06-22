-- Crear base de datos si no existe
IF DB_ID('TerrenosDB') IS NULL
BEGIN
    CREATE DATABASE TerrenosDB;
    PRINT '✅ Base de datos TerrenosDB creada exitosamente';
END
ELSE
BEGIN
    PRINT 'ℹ️ La base de datos TerrenosDB ya existe';
END;
GO

USE TerrenosDB;
GO

-- =============================================
-- TABLA: terrains (Terrenos)
-- =============================================
IF OBJECT_ID('terrains', 'U') IS NULL
BEGIN
    CREATE TABLE terrains (
        id NVARCHAR(10) PRIMARY KEY,
        size_m2 DECIMAL(10,2) NOT NULL CHECK (size_m2 > 0),
        price DECIMAL(12,2) NOT NULL CHECK (price > 0),
        status NVARCHAR(20) NOT NULL DEFAULT 'available'
            CHECK (status IN ('available', 'reserved', 'sold')),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla terrains creada exitosamente';
    
    -- Datos iniciales
    INSERT INTO terrains (id, size_m2, price, status) VALUES
    ('MX001', 236.07, 100000.00, 'available'),
    ('MX002', 750.00, 150000.00, 'reserved'),
    ('MX003', 600.00, 120000.00, 'sold'),
    ('MX004', 450.00, 90000.00, 'available'),
    ('MX005', 800.00, 160000.00, 'available'),
    ('MX006', 550.00, 110000.00, 'reserved'),
    ('MX007', 700.00, 140000.00, 'sold'),
    ('MX008', 650.00, 130000.00, 'available'),
    ('MX009', 480.00, 96000.00, 'available'),
    ('MX010', 520.00, 104000.00, 'reserved'),
    ('MX011', 600.00, 120000.00, 'sold'),
    ('MX012', 550.00, 110000.00, 'available');
    
    PRINT '✅ Datos iniciales insertados en terrains';

    UPDATE terrains SET price = CASE 
    WHEN id = 'MX001' THEN 100000.00
    WHEN id = 'MX002' THEN 150000.00
    WHEN id = 'MX003' THEN 120000.00
    WHEN id = 'MX004' THEN 90000.00
    WHEN id = 'MX005' THEN 160000.00
    WHEN id = 'MX006' THEN 110000.00
    WHEN id = 'MX007' THEN 140000.00
    WHEN id = 'MX008' THEN 130000.00
    WHEN id = 'MX009' THEN 96000.00
    WHEN id = 'MX010' THEN 104000.00
    WHEN id = 'MX011' THEN 120000.00
    WHEN id = 'MX012' THEN 110000.00
  END;
END
ELSE
BEGIN
    PRINT 'ℹ️ La tabla terrains ya existe';
    
    -- Añadir columnas si no existen
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('terrains') AND name = 'created_at')
    BEGIN
        ALTER TABLE terrains ADD created_at DATETIME DEFAULT GETDATE();
        PRINT '✅ Columna created_at añadida a terrains';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('terrains') AND name = 'updated_at')
    BEGIN
        ALTER TABLE terrains ADD updated_at DATETIME DEFAULT GETDATE();
        PRINT '✅ Columna updated_at añadida a terrains';
    END
END;
GO

-- =============================================
-- TABLA: reservations (Reservaciones)
-- =============================================
IF OBJECT_ID('reservations', 'U') IS NULL
BEGIN
    CREATE TABLE reservations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        terrain_id NVARCHAR(10) NOT NULL,
        customer_name NVARCHAR(100) NOT NULL,
        customer_email NVARCHAR(100) NOT NULL,
        customer_phone NVARCHAR(20) NOT NULL,
        payment_reference NVARCHAR(50),
        payment_amount DECIMAL(10,2),
        payment_status NVARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (payment_status IN ('pending', 'completed', 'cancelled')),
        deposit_type NVARCHAR(20) NOT NULL
            CHECK (deposit_type IN ('with_deposit', 'without_deposit')),
        total_amount DECIMAL(12,2),
        payments_made INT NOT NULL DEFAULT 0,
        payments_total INT NOT NULL DEFAULT 135,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (terrain_id) REFERENCES terrains(id)
    );
    PRINT '✅ Tabla reservations creada exitosamente';
    
    -- Crear índices
    CREATE INDEX idx_reservations_terrain_id ON reservations(terrain_id);
    CREATE INDEX idx_reservations_payment_reference ON reservations(payment_reference);
    CREATE INDEX idx_reservations_customer_email ON reservations(customer_email);
    PRINT '✅ Índices creados para reservations';
END
ELSE
BEGIN
    PRINT 'ℹ️ La tabla reservations ya existe';
    
    -- Añadir/modificar columnas si no existen
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reservations') AND name = 'deposit_type')
    BEGIN
        ALTER TABLE reservations
        ADD deposit_type NVARCHAR(20) NOT NULL DEFAULT 'with_deposit'
            CHECK (deposit_type IN ('with_deposit', 'without_deposit'));
        PRINT '✅ Columna deposit_type añadida a reservations';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reservations') AND name = 'total_amount')
    BEGIN
        ALTER TABLE reservations
        ADD total_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
        PRINT '✅ Columna total_amount añadida a reservations';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reservations') AND name = 'payments_made')
    BEGIN
        ALTER TABLE reservations
        ADD payments_made INT NOT NULL DEFAULT 0;
        PRINT '✅ Columna payments_made añadida a reservations';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reservations') AND name = 'payments_total')
    BEGIN
        ALTER TABLE reservations
        ADD payments_total INT NOT NULL DEFAULT 135;
        PRINT '✅ Columna payments_total añadida a reservations';
        
        -- Actualizar registros existentes según deposit_type
        UPDATE reservations
        SET payments_total = CASE 
            WHEN deposit_type = 'with_deposit' THEN 137 
            ELSE 135 
        END
        WHERE deposit_type IS NOT NULL;
        PRINT '✅ Valores de payments_total actualizados';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reservations') AND name = 'created_at')
    BEGIN
        ALTER TABLE reservations ADD created_at DATETIME DEFAULT GETDATE();
        PRINT '✅ Columna created_at añadida a reservations';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reservations') AND name = 'updated_at')
    BEGIN
        ALTER TABLE reservations ADD updated_at DATETIME DEFAULT GETDATE();
        PRINT '✅ Columna updated_at añadida a reservations';
    END
    
    -- Crear índices si no existen
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_reservations_terrain_id')
    BEGIN
        CREATE INDEX idx_reservations_terrain_id ON reservations(terrain_id);
        PRINT '✅ Índice idx_reservations_terrain_id creado';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_reservations_payment_reference')
    BEGIN
        CREATE INDEX idx_reservations_payment_reference ON reservations(payment_reference);
        PRINT '✅ Índice idx_reservations_payment_reference creado';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_reservations_customer_email')
    BEGIN
        CREATE INDEX idx_reservations_customer_email ON reservations(customer_email);
        PRINT '✅ Índice idx_reservations_customer_email creado';
    END
END;
GO

-- =============================================
-- TABLA: payments (Pagos)
-- =============================================
IF OBJECT_ID('payments', 'U') IS NULL
BEGIN
    CREATE TABLE payments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        reservation_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        payment_reference NVARCHAR(50) NOT NULL,
        payment_method NVARCHAR(20) NOT NULL DEFAULT 'paypal'
            CHECK (payment_method IN ('paypal', 'transfer', 'cash')),
        status NVARCHAR(20) NOT NULL DEFAULT 'completed'
            CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    );
    PRINT '✅ Tabla payments creada exitosamente';
    
    -- Crear índices
    CREATE INDEX idx_payments_reservation_id ON payments(reservation_id);
    CREATE INDEX idx_payments_payment_reference ON payments(payment_reference);
    PRINT '✅ Índices creados para payments';
END
ELSE
BEGIN
    PRINT 'ℹ️ La tabla payments ya existe';
    
    -- Añadir/modificar columnas si no existen
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'payment_method')
    BEGIN
        ALTER TABLE payments
        ADD payment_method NVARCHAR(20) NOT NULL DEFAULT 'paypal'
            CHECK (payment_method IN ('paypal', 'transfer', 'cash'));
        PRINT '✅ Columna payment_method añadida a payments';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'status')
    BEGIN
        ALTER TABLE payments
        ADD status NVARCHAR(20) NOT NULL DEFAULT 'completed'
            CHECK (status IN ('pending', 'completed', 'failed', 'refunded'));
        PRINT '✅ Columna status añadida a payments';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'created_at')
    BEGIN
        ALTER TABLE payments ADD created_at DATETIME DEFAULT GETDATE();
        PRINT '✅ Columna created_at añadida a payments';
    END
    
    -- Crear índices si no existen
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_payments_reservation_id')
    BEGIN
        CREATE INDEX idx_payments_reservation_id ON payments(reservation_id);
        PRINT '✅ Índice idx_payments_reservation_id creado';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_payments_payment_reference')
    BEGIN
        CREATE INDEX idx_payments_payment_reference ON payments(payment_reference);
        PRINT '✅ Índice idx_payments_payment_reference creado';
    END
END;
GO

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger para actualizar updated_at en terrains
CREATE OR ALTER TRIGGER tr_terrains_update_timestamp
ON terrains
AFTER UPDATE
AS
BEGIN
    UPDATE t
    SET updated_at = GETDATE()
    FROM terrains t
    INNER JOIN inserted i ON t.id = i.id;
END;
GO
PRINT '✅ Trigger tr_terrains_update_timestamp creado/actualizado';

-- Trigger para actualizar updated_at en reservations
CREATE OR ALTER TRIGGER tr_reservations_update_timestamp
ON reservations
AFTER UPDATE
AS
BEGIN
    UPDATE r
    SET updated_at = GETDATE()
    FROM reservations r
    INNER JOIN inserted i ON r.id = i.id;
END;
GO
PRINT '✅ Trigger tr_reservations_update_timestamp creado/actualizado';

-- Trigger para validar el estado del terreno al reservar
CREATE OR ALTER TRIGGER tr_validate_terrain_status
ON reservations
AFTER INSERT, UPDATE
AS
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM inserted i
        JOIN terrains t ON i.terrain_id = t.id
        WHERE t.status <> 'available'
    )
    BEGIN
        RAISERROR('No se puede reservar un terreno que no está disponible', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    
    -- Actualizar el estado del terreno a 'reserved'
    UPDATE t
    SET status = 'reserved',
        updated_at = GETDATE()
    FROM terrains t
    JOIN inserted i ON t.id = i.terrain_id;
END;
GO
PRINT '✅ Trigger tr_validate_terrain_status creado/actualizado';

-- Trigger para actualizar payments_total según deposit_type
CREATE OR ALTER TRIGGER tr_update_payments_total
ON reservations
AFTER INSERT, UPDATE
AS
BEGIN
    IF UPDATE(deposit_type)
    BEGIN
        UPDATE r
        SET payments_total = CASE 
                WHEN i.deposit_type = 'with_deposit' THEN 137 
                ELSE 135 
            END,
            updated_at = GETDATE()
        FROM reservations r
        INNER JOIN inserted i ON r.id = i.id;
    END
END;
GO
PRINT '✅ Trigger tr_update_payments_total creado/actualizado';

-- =============================================
-- PROCEDIMIENTOS ALMACENADOS
-- =============================================

-- Procedimiento para crear una reserva
CREATE OR ALTER PROCEDURE sp_create_reservation
    @terrain_id NVARCHAR(10),
    @customer_name NVARCHAR(100),
    @customer_email NVARCHAR(100),
    @customer_phone NVARCHAR(20),
    @payment_reference NVARCHAR(50) = NULL,
    @payment_amount DECIMAL(10,2),
    @deposit_type NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        
        -- Verificar que el terreno existe y está disponible
        DECLARE @terrain_price DECIMAL(12,2);
        DECLARE @terrain_status NVARCHAR(20);
        
        SELECT 
            @terrain_price = price,
            @terrain_status = status
        FROM terrains
        WHERE id = @terrain_id;
        
        IF @terrain_price IS NULL
        BEGIN
            RAISERROR('El terreno especificado no existe', 16, 1);
            ROLLBACK;
            RETURN;
        END
        
        IF @terrain_status <> 'available'
        BEGIN
            RAISERROR('El terreno no está disponible para reserva', 16, 1);
            ROLLBACK;
            RETURN;
        END
        
        -- Calcular el monto total y pagos totales según el tipo de enganche
        DECLARE @total_amount DECIMAL(12,2);
        DECLARE @payments_total INT;
        DECLARE @payments_made INT;
        
        IF @deposit_type = 'with_deposit'
        BEGIN
            SET @total_amount = @terrain_price * 0.95; -- 5% de descuento
            SET @payments_total = 137;
            SET @payments_made = 2; -- Enganche cuenta como 2 pagos
        END
        ELSE
        BEGIN
            SET @total_amount = @terrain_price;
            SET @payments_total = 135;
            SET @payments_made = 1; -- Primer pago
        END
        
        -- Insertar la reserva
        INSERT INTO reservations (
            terrain_id,
            customer_name,
            customer_email,
            customer_phone,
            payment_reference,
            payment_amount,
            deposit_type,
            payment_status,
            total_amount,
            payments_made,
            payments_total,
            created_at,
            updated_at
        ) VALUES (
            @terrain_id,
            @customer_name,
            @customer_email,
            @customer_phone,
            @payment_reference,
            @payment_amount,
            @deposit_type,
            'pending',
            @total_amount,
            @payments_made,
            @payments_total,
            GETDATE(),
            GETDATE()
        );
        
        -- Obtener el ID de la reserva creada
        DECLARE @reservation_id INT = SCOPE_IDENTITY();
        
        -- Actualizar el terreno a 'reserved'
        UPDATE terrains
        SET status = 'reserved',
            updated_at = GETDATE()
        WHERE id = @terrain_id;
        
        COMMIT;
        
        -- Retornar los datos de la reserva creada
        SELECT 
            id AS reservation_id,
            terrain_id,
            customer_name,
            customer_email,
            customer_phone,
            payment_reference,
            payment_amount,
            deposit_type,
            payment_status,
            total_amount,
            payments_made,
            payments_total,
            created_at
        FROM reservations
        WHERE id = @reservation_id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK;
        
        THROW;
    END CATCH
END;
GO
PRINT '✅ Procedimiento sp_create_reservation creado/actualizado';

-- Procedimiento para registrar un pago
CREATE OR ALTER PROCEDURE sp_create_payment
    @reservation_id INT,
    @amount DECIMAL(10,2),
    @payment_reference NVARCHAR(50),
    @payment_method NVARCHAR(20) = 'paypal'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        
        -- Verificar que la reserva existe
        IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = @reservation_id)
        BEGIN
            RAISERROR('La reserva especificada no existe', 16, 1);
            ROLLBACK;
            RETURN;
        END
        
        -- Verificar que hay pagos pendientes
        DECLARE @payments_made INT;
        DECLARE @payments_total INT;
        
        SELECT 
            @payments_made = payments_made,
            @payments_total = payments_total
        FROM reservations
        WHERE id = @reservation_id;
        
        IF @payments_made >= @payments_total
        BEGIN
            RAISERROR('No hay pagos pendientes para esta reserva', 16, 1);
            ROLLBACK;
            RETURN;
        END
        
        -- Registrar el pago
        INSERT INTO payments (
            reservation_id,
            amount,
            payment_reference,
            payment_method
        ) VALUES (
            @reservation_id,
            @amount,
            @payment_reference,
            @payment_method
        );
        
        -- Actualizar la reserva (incrementar payments_made)
        UPDATE reservations
        SET 
            payments_made = payments_made + 1,
            updated_at = GETDATE()
        WHERE id = @reservation_id;
        
        -- Si se completaron todos los pagos, marcar como 'completed'
        IF @payments_made + 1 >= @payments_total
        BEGIN
            UPDATE reservations
            SET 
                payment_status = 'completed',
                updated_at = GETDATE()
            WHERE id = @reservation_id;
            
            -- Actualizar el terreno a 'sold'
            UPDATE t
            SET 
                status = 'sold',
                updated_at = GETDATE()
            FROM terrains t
            JOIN reservations r ON t.id = r.terrain_id
            WHERE r.id = @reservation_id;
        END
        
        COMMIT;
        
        -- Retornar los datos del pago creado
        SELECT 
            p.id AS payment_id,
            p.reservation_id,
            p.amount,
            p.payment_reference,
            p.payment_method,
            p.status,
            p.created_at,
            r.payments_made,
            r.payments_total,
            (r.payments_total - r.payments_made) AS payments_remaining
        FROM payments p
        JOIN reservations r ON p.reservation_id = r.id
        WHERE p.id = SCOPE_IDENTITY();
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK;
        
        THROW;
    END CATCH
END;
GO
PRINT '✅ Procedimiento sp_create_payment creado/actualizado';

-- =============================================
-- VISTAS
-- =============================================

-- Vista para terrenos disponibles
CREATE OR ALTER VIEW vw_available_terrains
AS
SELECT 
    id,
    size_m2,
    price,
    status,
    created_at,
    updated_at
FROM terrains
WHERE status = 'available';
GO
PRINT '✅ Vista vw_available_terrains creada/actualizada';

-- Vista para reservas activas
CREATE OR ALTER VIEW vw_active_reservations
AS
SELECT 
    r.id,
    r.terrain_id,
    t.size_m2,
    t.price,
    r.customer_name,
    r.customer_email,
    r.customer_phone,
    r.payment_amount,
    r.deposit_type,
    r.total_amount,
    r.payments_made,
    r.payments_total,
    (r.payments_total - r.payments_made) AS payments_remaining,
    r.payment_status,
    r.created_at,
    r.updated_at
FROM reservations r
JOIN terrains t ON r.terrain_id = t.id
WHERE r.payment_status <> 'cancelled';
GO
PRINT '✅ Vista vw_active_reservations creada/actualizada';

-- Vista para historial de pagos
CREATE OR ALTER VIEW vw_payment_history
AS
SELECT 
    p.id,
    p.reservation_id,
    r.terrain_id,
    r.customer_name,
    p.amount,
    p.payment_reference,
    p.payment_method,
    p.status AS payment_status,
    p.created_at
FROM payments p
JOIN reservations r ON p.reservation_id = r.id;
GO
PRINT '✅ Vista vw_payment_history creada/actualizada';

IF OBJECT_ID('Administradores', 'U') IS NULL
BEGIN
 
    CREATE TABLE Administradores (
    IdAdmin INT PRIMARY KEY IDENTITY(1,1),
    NombreUsuario NVARCHAR(50) NOT NULL,
    Contraseña NVARCHAR(50) NOT NULL,
    Email NVARCHAR(100)
   
     );
 
    INSERT INTO Administradores (NombreUsuario, Contraseña, Email)
    VALUES ('admin', 'contraseña123', 'admin@example.com');
END;
GO

PRINT '🎉 Base de datos TerrenosDB configurada exitosamente!';
GO