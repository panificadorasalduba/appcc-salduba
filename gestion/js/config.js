// Configuración de Gestión Obradores.
// Conexión a la nube (Supabase). La clave "anon" es pública por diseño: los
// datos los protegen el inicio de sesión y las reglas de la base de datos.
// Con ?local=1 en la dirección la app funciona en MODO PRUEBA: los datos se
// guardan solo en ese navegador (sirve para probar, nunca para el uso diario).
window.APPCC_CONFIG = {
  producto: 'Gestión Obradores',
  supabaseUrl: 'https://mhdrdrxorncoktumlovq.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZHJkcnhvcm5jb2t0dW1sb3ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NDYyNzAsImV4cCI6MjEwODAyMjI3MH0.uYlpxqVu0rBChHFg3AgdhYse16ISXqHNh7LBXfXUa-U',
  // Mientras sea false no aparece «Crear cuenta»: las altas las hace Berta.
  // Al abrir la venta se pone a true y se activa el registro en Supabase.
  registroAbierto: false,
};
if (new URLSearchParams(location.search).has('local')) {
  window.APPCC_CONFIG.supabaseUrl = '';
  window.APPCC_CONFIG.supabaseAnonKey = '';
}
