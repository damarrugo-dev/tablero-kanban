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

// Inicio de sesión con correo corporativo de Microsoft.
// En null, cualquiera con el enlace entra sin iniciar sesión.
// Para activarlo:
// export const loginMicrosoft = {
//   tenant: "ID-del-directorio-de-Microsoft-Entra",  // o "organizations"
//   domain: "miempresa.com"                          // solo se aceptan correos de este dominio
// };
export const loginMicrosoft = null;
