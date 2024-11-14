setInterval(() => {
    fetch('http://localhost:3000/keepalive')
        .then(response => response.json())
        .then(data => console.log("Manteniendo sesión activa"))
        .catch(error => console.error("Error manteniendo sesión activa:", error));
}, 30 * 60 * 1000); // Cada 30 minutos

