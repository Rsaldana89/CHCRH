const db = require('../config/db');

const User = {
  create: (username, password, role, full_name, callback) => {
    // Insertar directamente la contraseña en texto plano
    db.query(
      'INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)',
      [username, password, role, full_name],
      callback
    );
  },

  findByUsername: (username, callback) => {
    // Buscar usuario por nombre de usuario
    db.query('SELECT * FROM users WHERE username = ?', [username], callback);
  }
};

module.exports = User;
