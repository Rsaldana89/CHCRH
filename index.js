const express = require('express');
const app = express();
const port = 3000;

const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const jwt = require('jsonwebtoken');

const mysqldump = require('mysqldump');
const path = require('path');
const fs = require('fs');

const axios = require('axios');



// keepalive en el servidor usando axios
setInterval(() => {
    axios.get('http://0.0.0.0:3000/keepalive')
        .then(response => console.log("Solicitud de keepalive desde el servidor"))
        .catch(error => console.error("Error manteniendo sesión activa desde el servidor:", error));
}, 5 * 60 * 1000); // Cada 5 minutos


app.get('/keepalive', (req, res) => {
    console.log('Solicitud de keepalive recibida');
    res.status(200).json({ message: 'Manteniendo sesión activa' });
});


app.get('/admin/backup', authenticateToken, async (req, res) => {
    try {
        const backupPath = path.join(__dirname, 'backups', `backup_${new Date().toISOString().slice(0, 10)}.sql`);

        await mysqldump({
            connection: {
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
            },
            dumpToFile: backupPath,
        });

        res.download(backupPath, (err) => {
            if (err) {
                console.error('Error al descargar el respaldo:', err);
                res.status(500).send('Error al descargar el respaldo');
            } else {
                fs.unlink(backupPath, (unlinkErr) => {
                    if (unlinkErr) console.error('Error al eliminar el archivo de respaldo:', unlinkErr);
                });
            }
        });
    } catch (error) {
        console.error('Error al generar el respaldo:', error);
        res.status(500).json({ error: 'Error al generar el respaldo de la base de datos' });
    }
});



app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // No autorizado si no hay token

    jwt.verify(token, 'secret_key', (err, user) => {
        if (err) return res.sendStatus(403); // Token no válido
        req.user = user; // Asigna el usuario decodificado a req.user
        next(); // Continúa al siguiente middleware o ruta
    });
}



app.use('/auth', authRoutes);

app.get('/dashboard', authenticateToken, (req, res) => {
    res.json({ username: req.user.username, full_name: req.user.full_name, role: req.user.role });
});

app.get('/vacaciones', authenticateToken, (req, res) => {
    const query = `
    SELECT 
        employee_number, 
        full_name, 
        department_name,
        FLOOR(DATEDIFF(CURDATE(), start_date) / 365) AS years_worked,
        CASE
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 1 THEN 12
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 2 THEN 14
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 3 THEN 16
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 4 THEN 18
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 5 THEN 20
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 6 AND 10 THEN 22
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 11 AND 15 THEN 24
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 16 AND 20 THEN 26
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 21 AND 25 THEN 28
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 26 AND 30 THEN 30
            ELSE 12
        END AS total_vacation_days,
        IFNULL(days_taken, 0) AS days_taken,
        CASE
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 1 THEN 12
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 2 THEN 14
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 3 THEN 16
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 4 THEN 18
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) = 5 THEN 20
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 6 AND 10 THEN 22
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 11 AND 15 THEN 24
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 16 AND 20 THEN 26
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 21 AND 25 THEN 28
            WHEN FLOOR(DATEDIFF(CURDATE(), start_date) / 365) BETWEEN 26 AND 30 THEN 30
            ELSE 12 
        END - IFNULL(days_taken, 0) AS remaining_days
    FROM personal
    ORDER BY employee_number;
    `;

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener los datos de vacaciones' });
        }
        res.json({
            role: req.user.role,
            data: results
        });
    });
});

app.get('/admin/personal', authenticateToken, (req, res) => {
    const query = `
    SELECT 
        employee_number, 
        full_name, 
        rfc, 
        curp, 
        nss, 
        puesto, 
        department_name, 
        start_date, 
        fecha_baja, 
        fecha_reingreso, 
        birth_date,
        days_pending,   -- Agregado
        days_taken      -- Agregado
    FROM personal
    ORDER BY 
        CASE WHEN department_name = 'Baja' THEN 1 ELSE 0 END, 
        employee_number;
    `;
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener los datos del personal' });
        }
        res.json(results);
    });
});

app.get('/admin/personal/:employee_number', authenticateToken, (req, res) => {
    const { employee_number } = req.params;
    const query = 'SELECT * FROM personal WHERE employee_number = ?';
    db.query(query, [employee_number], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener el empleado' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado' });
        }
        res.json(results[0]);
    });
});

app.post('/admin/personal', authenticateToken, (req, res) => {
    const { 
        employee_number, 
        full_name, 
        rfc, 
        curp, 
        nss, 
        puesto, 
        department_name, 
        start_date, 
        fecha_baja, 
        fecha_reingreso, 
        birth_date 
    } = req.body;

    if (!employee_number || !full_name || !department_name || !start_date || !birth_date) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const query = `
        INSERT INTO personal (employee_number, full_name, rfc, curp, nss, puesto, department_name, start_date, fecha_baja, fecha_reingreso, birth_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(query, [employee_number, full_name, rfc, curp, nss, puesto, department_name, start_date, fecha_baja, fecha_reingreso, birth_date], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'El número de empleado ya existe' });
            }
            console.error('Error al agregar el empleado:', err);
            return res.status(500).json({ error: 'Error al agregar el empleado' });
        }

        // Si el empleado se agregó correctamente, insertar 52 semanas de asistencias para el nuevo empleado
        const year = new Date().getFullYear();
        const attendanceRecords = [];

        for (let week = 1; week <= 52; week++) {
            attendanceRecords.push([employee_number, week, year, '1', '1', '1', '1', '1', '1', '1']);
        }

        const attendanceQuery = `
            INSERT INTO asistencias (EMPLOYEE_NUMBER, WEEK_NUMBER, YEAR, LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO)
            VALUES ?
        `;

        db.query(attendanceQuery, [attendanceRecords], (err2) => {
            if (err2) {
                console.error('Error al agregar registros de asistencia:', err2);
                return res.status(500).json({ error: 'Error al generar las asistencias para el nuevo empleado' });
            }

            res.status(201).json({ message: 'Empleado y asistencias agregados correctamente' });
        });
    });

});

// Nueva ruta para actualizar los campos de días pendientes y días tomados
app.put('/admin/personal/vacaciones/:employee_number', authenticateToken, (req, res) => {
    const { employee_number } = req.params;
    const { days_pending, days_taken } = req.body;

    // Validar que los valores sean correctos
    if (days_pending >= 0 && days_pending <= 60 && days_taken >= 0 && days_taken <= 60) {
        const query = 'UPDATE personal SET days_pending = ?, days_taken = ? WHERE employee_number = ?';
        db.query(query, [days_pending, days_taken, employee_number], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Error al actualizar los datos de vacaciones' });
            }
            res.json({ message: 'Vacaciones actualizadas correctamente' });
        });
    } else {
        res.status(400).json({ error: 'Los valores de días deben estar entre 0 y 60' });
    }
});

// Nueva ruta para actualizar los registros de asistencia en la base de datos
app.put('/admin/attendances/:employee_number/:week/:year', authenticateToken, (req, res) => {
    const { employee_number, week, year } = req.params;
    let { 
        LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO, 
        COMPENSACION, COMISION, BONO_PRODUCTIVIDAD, APOYO_TRANSPORTE, PRIMA_DOMINICAL,
        DESCUENTO_PRESTAMO_INVENTARIO, NOTAS
    } = req.body;

    // Asegurarse de que los valores numéricos se procesen correctamente
    COMPENSACION = COMPENSACION ? parseFloat(COMPENSACION) : 0;
    COMISION = COMISION ? parseInt(COMISION, 10) : 0;
    BONO_PRODUCTIVIDAD = BONO_PRODUCTIVIDAD ? parseFloat(BONO_PRODUCTIVIDAD) : 0;
    APOYO_TRANSPORTE = APOYO_TRANSPORTE ? parseFloat(APOYO_TRANSPORTE) : 0;
    PRIMA_DOMINICAL = PRIMA_DOMINICAL ? parseFloat(PRIMA_DOMINICAL) : 0;
    DESCUENTO_PRESTAMO_INVENTARIO = DESCUENTO_PRESTAMO_INVENTARIO ? parseFloat(DESCUENTO_PRESTAMO_INVENTARIO) : 0;
    NOTAS = NOTAS || ''; // Si está vacío, lo definimos como una cadena vacía

    const query = `
        UPDATE asistencias 
        SET LUNES = ?, 
            MARTES = ?, 
            MIERCOLES = ?, 
            JUEVES = ?, 
            VIERNES = ?, 
            SABADO = ?, 
            DOMINGO = ?, 
            COMPENSACION = ?, 
            COMISION = ?, 
            BONO_PRODUCTIVIDAD = ?, 
            APOYO_TRANSPORTE = ?, 
            PRIMA_DOMINICAL = ?, 
            DESCUENTO_PRESTAMO_INVENTARIO = ?, 
            NOTAS = ?
        WHERE EMPLOYEE_NUMBER = ? AND WEEK_NUMBER = ? AND YEAR = ?
    `;

    const values = [
        LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO, 
        COMPENSACION, COMISION, BONO_PRODUCTIVIDAD, APOYO_TRANSPORTE, PRIMA_DOMINICAL,
        DESCUENTO_PRESTAMO_INVENTARIO, NOTAS, employee_number, week, year
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error al actualizar los datos de asistencia:', err);
            return res.status(500).json({ error: 'Error al actualizar los datos de asistencia' });
        }
        res.json({ success: true, message: 'Asistencia actualizada correctamente' });
    });

});






app.put('/admin/personal/:employee_number', authenticateToken, (req, res) => {
    const { employee_number } = req.params;
    const { 
        full_name, 
        rfc, 
        curp, 
        nss, 
        puesto, 
        department_name, 
        start_date, 
        fecha_baja, 
        fecha_reingreso, 
        birth_date 
    } = req.body;

    const query = `
        UPDATE personal 
        SET full_name = ?, 
            rfc = ?, 
            curp = ?, 
            nss = ?, 
            puesto = ?, 
            department_name = ?, 
            start_date = ?, 
            fecha_baja = ?, 
            fecha_reingreso = ?, 
            birth_date = ?
        WHERE employee_number = ?
    `;

    db.query(query, [full_name, rfc, curp, nss, puesto, department_name, start_date, fecha_baja, fecha_reingreso, birth_date, employee_number], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al actualizar el empleado' });
        }
        res.json({ message: 'Empleado actualizado correctamente' });
    });
});

// Modificación para actualizar la fecha de baja automáticamente
app.put('/admin/personal/baja/:employee_number', authenticateToken, (req, res) => {
    const { employee_number } = req.params;

    // Obtener la fecha actual para la baja
    const currentDate = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD

    const query = 'UPDATE personal SET department_name = "Baja", fecha_baja = ? WHERE employee_number = ?';
    db.query(query, [currentDate, employee_number], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al dar de baja al empleado' });
        }
        res.json({ message: 'Empleado dado de baja correctamente', fecha_baja: currentDate });
    });
});

app.get('/admin/attendances', authenticateToken, (req, res) => {
    const { week, year } = req.query;

    const query = `
        SELECT
            p.employee_number AS 'Codigo trabajador',
            p.department_name AS 'Departamento',
            p.full_name AS 'Nombre',
            a.LUNES,
            a.MARTES,
            a.MIERCOLES,
            a.JUEVES,
            a.VIERNES,
            a.SABADO,
            a.DOMINGO,
            COALESCE(a.TOTAL_EXTRA, 0) AS 'T.Extra Total',
            COALESCE(a.DIAS_DESCANSO_TRABAJADO, 0) AS 'Dias descanso trabajado',
            COALESCE(a.FALTA, 0) AS 'Falta',
            COALESCE(a.COMPENSACION, 0) AS 'Compensacion',
            COALESCE(a.COMISION, 0) AS 'Comision',
            COALESCE(a.BONO_PRODUCTIVIDAD, 0) AS 'Bono productividad',
            COALESCE(a.APOYO_TRANSPORTE, 0) AS 'Apoyo transporte',
            COALESCE(a.PRIMA_DOMINICAL, 0) AS 'Prima dominical',
            COALESCE(a.DIAS_FESTIVOS, 0) AS 'Dias festivos',
            COALESCE(a.INCAPACIDAD, 0) AS 'Incapacidad',
            COALESCE(a.DESCUENTO_PRESTAMO_INVENTARIO, 0) AS 'Descuento prestamo inventario',
            COALESCE(a.NOTAS, 'Sin notas') AS 'Notas'
        FROM asistencias a
        INNER JOIN personal p ON a.EMPLOYEE_NUMBER = p.employee_number
        WHERE a.WEEK_NUMBER = ? AND a.YEAR = ?
        ORDER BY p.employee_number;
    `;

    db.query(query, [week, year], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener los datos de asistencias' });
        }
        res.json(results);
    });
});

process.on('uncaughtException', (error) => {
    console.error("Uncaught Exception:", error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

app.use((err, req, res, next) => {
    console.error("Error detectado:", err);
    res.status(500).send("Internal Server Error");
});



app.listen(port, '0.0.0.0', () => {
     console.log(`Servidor corriendo en http://0.0.0.0:${port}`);
});
