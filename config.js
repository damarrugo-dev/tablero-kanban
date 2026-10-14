// Configuración de la base de datos compartida (Firebase).
// Si se pone en null, el tablero funciona en "modo de prueba" (solo guarda en el navegador).
export const firebaseConfig = {
  apiKey: "AIzaSyA0c0X87PBi3a21YJOkH970xE12OHiaY_Y",
  authDomain: "tablero-kanban-f5f28.firebaseapp.com",
  projectId: "tablero-kanban-f5f28",
  storageBucket: "tablero-kanban-f5f28.firebasestorage.app",
  messagingSenderId: "670983517801",
  appId: "1:670983517801:web:f2918705cfdc983870d4f8"
};

// Inicio de sesión: solo entran personas con correo de la empresa.
// En null, cualquiera con el enlace entra sin iniciar sesión.
// Para activarlo:
// export const login = {
//   metodo: "correo",        // "correo": llega un enlace al correo | "microsoft": cuenta de Microsoft
//   dominios: ["miempresa.com"] // solo se aceptan correos de estos dominios
//   administradores: ["tu@miempresa.com"] // ven el registro de accesos (botón "Accesos")
//   // tenant: "..."         // solo para "microsoft": ID del directorio de Microsoft Entra
// };
export const login = {
  metodo: "correo",
  dominios: ["hitss.com", "anava.com"],
  administradores: ["marrugod@hitss.com"] // pueden ver el control de acceso
};
