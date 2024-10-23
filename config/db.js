// Cargar las variables de entorno desde el archivo .env
require('dotenv').config();

const mysql = require('mysql2');

// Crear la conexión a la base de datos utilizando las variables de entorno de Railway
const connection = mysql.createConnection({
  host: process.env.MYSQLHOST,          // Host de la base de datos
  user: process.env.MYSQLUSER,          // Usuario de la base de datos
  password: process.env.MYSQLPASSWORD,  // Contraseña de la base de datos
  database: process.env.MYSQLDATABASE,  // Nombre de la base de datos
  port: process.env.MYSQLPORT           // Puerto (Railway usa el 3306)
});

// Conectar a la base de datos
connection.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.stack);
    return;
  }
  console.log('Conectado a la base de datos en Railway.');
});

module.exports = connection;
