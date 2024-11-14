const User = require('../models/User');
const jwt = require('jsonwebtoken');

const authController = {
  register: (req, res) => {
    const { username, password, role, full_name } = req.body;

    // Crear el usuario con el campo full_name
    User.create(username, password, role, full_name, (err, results) => {
      if (err) return res.status(500).json({ error: 'Error al crear el usuario' });
      res.status(201).json({ message: 'Usuario creado exitosamente' });
    });
  },

  login: (req, res) => {
    const { username, password } = req.body;

    // Buscar el usuario por nombre de usuario
    User.findByUsername(username, (err, results) => {
      if (err) return res.status(500).json({ error: 'Error interno del servidor' });
      if (results.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });

      const user = results[0];

      // Comparación de contraseña en texto plano
      if (password !== user.password) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
      }

      // Crear y enviar el token JWT, incluyendo full_name en el payload
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, full_name: user.full_name }, 'secret_key', { expiresIn: '1h' });
      res.json({ message: 'Login exitoso', token });
    });
  }
};

module.exports = authController;
