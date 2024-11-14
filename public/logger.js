const fs = require('fs');
const path = require('path');


function logEvent(eventType, details) {
    const logFilePath = path.join(__dirname, 'public', 'log.json');

    // Crear el registro de evento
    const event = {
        timestamp: new Date().toISOString(),
        eventType: eventType,
        details: details,
    };

    // Leer el archivo actual y agregar el nuevo evento
    fs.readFile(logFilePath, 'utf8', (err, data) => {
        let logs = [];
        if (!err && data) {
            logs = JSON.parse(data);
        }

        logs.push(event);

        // Guardar el log actualizado
        fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), (err) => {
            if (err) {
                console.error('Error al escribir en log.json:', err);
            }
        });
    });
}
