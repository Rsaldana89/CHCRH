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

const schedule = require('node-schedule');

process.env.TZ = 'America/Mexico_City';

// Definir la ruta del archivo de logs y la función logActivity
const logPath = path.join(__dirname, 'public', 'log.json');

function logActivity(action, user, details) {
    const query = `
        INSERT INTO logs (action, user, details)
        VALUES (?, ?, ?)
    `;

    const values = [
        action,
        user,
        JSON.stringify(details) // Convertir los detalles a texto
    ];

    db.query(query, values, (err) => {
        if (err) {
            // Ignorar errores relacionados con la tabla 'logs' inexistente
            if (err.code === 'ER_NO_SUCH_TABLE') {
                console.warn('La tabla "logs" no existe. Registro de logs omitido.');
            } else {
                console.error('Error al registrar el log en la base de datos:', err);
            }
        }
    });
}




// Ruta de la carpeta de backups
const backupsDir = path.join(__dirname, 'backups');

// Verificar si la carpeta existe; si no, crearla
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
    console.log('Carpeta backups creada.');
}


// Programa para reiniciar a las 5:00 AM
schedule.scheduleJob('0 6 * * *', () => {
    console.log('Reinicio programado a las 6:00 AM');
    restartApplication();
});

// Programa para reiniciar a las 12:00 PM
schedule.scheduleJob('0 12 * * *', () => {
    console.log('Reinicio programado a las 12:00 PM');
    restartApplication();
});

// Programa para reiniciar a las 5:00 PM
schedule.scheduleJob('0 18 * * *', () => {
    console.log('Reinicio programado a las 6:00 PM');
    restartApplication();
});


// Programa para reiniciar a las 8:00 PM
schedule.scheduleJob('0 21 * * *', () => {
    console.log('Reinicio programado a las 9:00 PM');
    restartApplication();
});



// Función para reiniciar la aplicación
function restartApplication() {
    console.log('Reiniciando aplicación en Railway...');
    process.exit(0); // Provoca que Railway reinicie el contenedor
}



// keepalive en el servidor usando axios
setInterval(() => {
    axios.get('http://0.0.0.0:3000/keepalive')
        .then(response => console.log("Solicitud de keepalive desde el servidor"))
        .catch(error => console.error("Error manteniendo sesión activa desde el servidor:", error));
}, 20 * 60 * 1000); // Cada 20 minutos


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
                timezone: 'local'
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
        fecha_reingreso 
    } = req.body;

    if (!employee_number || !full_name || !department_name || !start_date) {
        return res.status(400).json({ error: 'Todos los campos obligatorios deben estar presentes' });
    }
    
    const query = `
        INSERT INTO personal (employee_number, full_name, rfc, curp, nss, puesto, department_name, start_date, fecha_baja, fecha_reingreso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(query, [employee_number, full_name, rfc, curp, nss, puesto, department_name, start_date, fecha_baja, fecha_reingreso], (err, result) => {
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

            // Registrar la acción en el log
            logActivity('Agregar empleado', req.user.username, { 
                employee_number, 
                full_name, 
                department_name, 
                start_date 
            });

            res.status(201).json({ message: 'Empleado y asistencias agregados correctamente' });
        });
    });
});


app.post('/admin/personal/bulk', authenticateToken, (req, res) => {
    const employees = req.body; // Se espera un array de empleados

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
        return res.status(400).json({ error: 'No se enviaron datos o el formato no es válido.' });
    }

    // Validar que cada empleado tenga los campos requeridos
    for (const employee of employees) {
        if (!employee.employee_number || !employee.full_name || !employee.department_name || !employee.start_date) {
            return res.status(400).json({
                error: `El empleado ${employee.employee_number || '[sin ID]'} tiene datos incompletos.`,
            });
        }
    }

    // Construir los valores para la inserción masiva
    const values = employees.map((emp) => [
        emp.employee_number,
        emp.full_name,
        emp.rfc || null,
        emp.curp || null,
        emp.nss || null,
        emp.puesto || null,
        emp.department_name,
        emp.start_date,
        emp.fecha_baja || null,
        emp.fecha_reingreso || null,
    ]);

    const query = `
        INSERT INTO personal (employee_number, full_name, rfc, curp, nss, puesto, department_name, start_date, fecha_baja, fecha_reingreso)
        VALUES ?
    `;

    db.query(query, [values], (err, result) => {
        if (err) {
            console.error('Error al agregar empleados:', err);

            // Detectar duplicados
            if (err.code === 'ER_DUP_ENTRY') {
                const match = err.sqlMessage.match(/Duplicate entry '(\d+)' for key/);
                const duplicateID = match ? match[1] : 'desconocido';
                return res.status(409).json({
                    error: `El empleado con ID ${duplicateID} ya existe en la base de datos.`,
                });
            }

            return res.status(500).json({
                error: 'Error al agregar empleados. Revisa los datos y vuelve a intentar.',
            });
        }

        // Si los empleados se agregaron correctamente, insertar asistencias para cada uno
        const year = new Date().getFullYear();
        const attendanceRecords = [];

        employees.forEach((emp) => {
            for (let week = 1; week <= 52; week++) {
                attendanceRecords.push([
                    emp.employee_number,
                    week,
                    year,
                    '1', // LUNES
                    '1', // MARTES
                    '1', // MIERCOLES
                    '1', // JUEVES
                    '1', // VIERNES
                    '1', // SABADO
                    '1', // DOMINGO
                ]);
            }
        });

        const attendanceQuery = `
            INSERT INTO asistencias (EMPLOYEE_NUMBER, WEEK_NUMBER, YEAR, LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO)
            VALUES ?
        `;

        db.query(attendanceQuery, [attendanceRecords], (err2) => {
            if (err2) {
                console.error('Error al agregar registros de asistencia:', err2);
                return res.status(500).json({ error: 'Error al generar las asistencias para los nuevos empleados.' });
            }

            // Registrar la acción en el log
            logActivity('Agregar empleados (masivo)', req.user.username, {
                total_empleados: employees.length,
                empleados: employees.map((e) => ({
                    employee_number: e.employee_number,
                    full_name: e.full_name,
                    department_name: e.department_name,
                })),
            });

            res.status(201).json({
                message: 'Empleados y asistencias agregados correctamente.',
                added: result.affectedRows,
            });
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

            // Registrar la acción en el log
            logActivity('Actualizar vacaciones', req.user.username, {
                employee_number,
                days_pending,
                days_taken,
            });

            res.json({ message: 'Vacaciones actualizadas correctamente' });
        });
    } else {
        res.status(400).json({ error: 'Los valores de días deben estar entre 0 y 60' });
    }
});


// Nueva ruta para actualizar los registros de asistencia en la base de datos
// Nueva ruta para actualizar los registros de asistencia en la base de datos
app.put('/admin/attendances/:employee_number/:week/:year', authenticateToken, (req, res) => {
    const { employee_number, week, year } = req.params;
    let { 
        LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO, 
        COMPENSACION, COMISION, BONO_PRODUCTIVIDAD, APOYO_TRANSPORTE, PRIMA_DOMINICAL,
        DESCUENTO_PRESTAMO_INVENTARIO, BONO_RECOMENDACION, DESCUENTO_EFECTIVO, NOTAS
    } = req.body;

    // Asegurarse de que los valores numéricos se procesen correctamente
    COMPENSACION = COMPENSACION ? parseFloat(COMPENSACION) : 0;
    COMISION = COMISION ? parseInt(COMISION, 10) : 0;
    BONO_PRODUCTIVIDAD = BONO_PRODUCTIVIDAD ? parseFloat(BONO_PRODUCTIVIDAD) : 0;
    APOYO_TRANSPORTE = APOYO_TRANSPORTE ? parseFloat(APOYO_TRANSPORTE) : 0;
    PRIMA_DOMINICAL = PRIMA_DOMINICAL ? parseFloat(PRIMA_DOMINICAL) : 0;
    DESCUENTO_PRESTAMO_INVENTARIO = DESCUENTO_PRESTAMO_INVENTARIO ? parseFloat(DESCUENTO_PRESTAMO_INVENTARIO) : 0;
    BONO_RECOMENDACION = BONO_RECOMENDACION ? parseFloat(BONO_RECOMENDACION) : 0;
    DESCUENTO_EFECTIVO = DESCUENTO_EFECTIVO ? parseFloat(DESCUENTO_EFECTIVO) : 0;
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
            BONO_RECOMENDACION = ?, 
            DESCUENTO_EFECTIVO = ?, 
            NOTAS = ?
        WHERE EMPLOYEE_NUMBER = ? AND WEEK_NUMBER = ? AND YEAR = ?
    `;

    const values = [
        LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO, 
        COMPENSACION, COMISION, BONO_PRODUCTIVIDAD, APOYO_TRANSPORTE, PRIMA_DOMINICAL,
        DESCUENTO_PRESTAMO_INVENTARIO, BONO_RECOMENDACION, DESCUENTO_EFECTIVO, NOTAS, 
        employee_number, week, year
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error al actualizar los datos de asistencia:', err);
            return res.status(500).json({ error: 'Error al actualizar los datos de asistencia' });
        }

        // Registrar la acción en el log
        logActivity('Actualizar asistencia', req.user.username, {
            employee_number,
            week,
            year,
            asistencia: {
                LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO,
                COMPENSACION, COMISION, BONO_PRODUCTIVIDAD, APOYO_TRANSPORTE, PRIMA_DOMINICAL,
                DESCUENTO_PRESTAMO_INVENTARIO, BONO_RECOMENDACION, DESCUENTO_EFECTIVO, NOTAS
            }
        });

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
        fecha_reingreso 
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
            fecha_reingreso = ?
        WHERE employee_number = ?
    `;

    db.query(query, [full_name, rfc, curp, nss, puesto, department_name, start_date, fecha_baja, fecha_reingreso, employee_number], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al actualizar el empleado' });
        }

        // Registrar la acción en el log
        logActivity('Actualizar empleado', req.user.username, {
            employee_number,
            updated_fields: {
                full_name,
                rfc,
                curp,
                nss,
                puesto,
                department_name,
                start_date,
                fecha_baja,
                fecha_reingreso
            }
        });

        res.json({ message: 'Empleado actualizado correctamente' });
    });
});


// Modificación para actualizar la fecha de baja con fecha proporcionada o actual
app.put('/admin/personal/baja/:employee_number', authenticateToken, (req, res) => {
    const { employee_number } = req.params;
    const { fecha_baja } = req.body;

    // Determinar la fecha de baja: usar la proporcionada o la fecha actual
    const finalFechaBaja = fecha_baja || new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD

    // Validar que la fecha de baja sea válida
    if (isNaN(new Date(finalFechaBaja).getTime())) {
        return res.status(400).json({ error: 'La fecha de baja proporcionada no es válida.' });
    }

    const query = 'UPDATE personal SET department_name = "Baja", fecha_baja = ? WHERE employee_number = ?';
    db.query(query, [finalFechaBaja, employee_number], (err) => {
        if (err) {
            console.error('Error al dar de baja al empleado:', err);
            return res.status(500).json({ error: 'Error al dar de baja al empleado.' });
        }

        // Registrar la acción en el log
        logActivity('Dar de baja empleado', req.user.username, {
            employee_number,
            fecha_baja: finalFechaBaja
        });

        res.json({ message: 'Empleado dado de baja correctamente', fecha_baja: finalFechaBaja });
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
            COALESCE(a.BONO_RECOMENDACION, 0) AS 'Bono recomendacion',
            COALESCE(a.DESCUENTO_EFECTIVO, 0) AS 'Descuento efectivo',
            COALESCE(a.NOTAS, 'Sin notas') AS 'Notas'
        FROM asistencias a
        INNER JOIN personal p ON a.EMPLOYEE_NUMBER = p.employee_number
        WHERE a.WEEK_NUMBER = ? AND a.YEAR = ?
        ORDER BY p.employee_number;
    `;

    const values = [week, year];

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('Error al obtener las asistencias:', err);
            return res.status(500).json({ error: 'Error al obtener las asistencias' });
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