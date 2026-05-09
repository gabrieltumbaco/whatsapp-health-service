function getGreeting(): string {
  const now = new Date();
  const hour = (now.getUTCHours() - 5 + 24) % 24; // UTC-5 Ecuador
  if (hour >= 6 && hour < 12) return 'buenos días';
  if (hour >= 12 && hour < 18) return 'buenas tardes';
  return 'buenas noches';
}

function orderNumber(): string {
  return String(Math.floor(Math.random() * 1_000_000_000));
}

const templates: Array<() => string> = [
  () => `Hola ${getGreeting()}, ¿puedes ayudarme con un problema en mi cuenta de número ${orderNumber()}? 🤔`,
  () => `¡Hola! Necesito ayuda con un pedido que realicé. 📦 El número del pedido es: ${orderNumber()}`,
  () => `${getGreeting()}, ¿cómo puedo cambiar la dirección de envío? 🏡`,
  () => `¡Hola! ${getGreeting()}, tengo un problema con la factura de mi última compra. 🧾`,
  () => `Necesito información sobre el proceso de devolución. ¿Me puedes ayudar? 🔄`,
  () => `${getGreeting()}, estoy teniendo problemas para iniciar sesión en mi cuenta. 🔐`,
  () => `Hola ${getGreeting()}, ¿puedo cambiar mi método de pago? 💳`,
  () => `${getGreeting()}, tengo una pregunta sobre las promociones actuales. 🎉`,
  () => `Hola ${getGreeting()}, ¿cómo puedo rastrear mi paquete? 🚚`,
  () => `Hola ${getGreeting()}, estoy interesado en devolver un artículo. ¿Cuál es el proceso? 🔄`,
  () => `${getGreeting()}, ¿tienen servicio de atención al cliente por teléfono? ☎️`,
  () => `${getGreeting()}, tengo problemas para aplicar un cupón de descuento. 🎫`,
  () => `Hola, ¿hay alguna oferta especial para clientes frecuentes? 🌟`,
  () => `Hola, ¿cómo puedo recuperar mi contraseña olvidada? 🔑`,
  () => `${getGreeting()}, ¿tienen una política de garantía para sus productos? 🛡️`,
  () => `Hola ${getGreeting()}, ¿cuáles son los métodos de pago aceptados? 💳`,
  () => `Hola ${getGreeting()}, ¿puedo cancelar un pedido que acabo de realizar? 🚫📦`,
  () => `Hola, ¿tienen alguna recomendación de productos más vendidos? 🌟`,
  () => `Hola, ¿puedes decirme si hay descuentos para estudiantes? 🎓`,
  () => `¡Hola! Tengo un problema con mi cuenta y necesito ayuda.`,
  () => `Hola, tengo un problema con la factura de mi compra más reciente.`,
  () => `Necesito detalles sobre cómo realizar una devolución. ¿Puedes asistirme? 🔄`,
  () => `Hola, ¿podrían indicarme cómo hacer el seguimiento de mi paquete? 📦`,
  () => `Hola, ¿ofrecen asistencia telefónica al cliente? ☎️`,
  () => `Hola ${getGreeting()}, estoy teniendo dificultades para aplicar un cupón de descuento.`,
  () => `¡Hola! Metí la pata y quiero cancelar un pedido que hice hace poco. 🚫📦 ¿Es posible?`,
  () => `Saludos, recibí un artículo defectuoso. ⚠️ ¿Cómo puedo obtener un reembolso? 💰`,
  () => `¡Hola! Solicité un reembolso. ¿Cuánto tiempo suele tomar el proceso? ⏳`,
  () => `Hola ${getGreeting()}, necesito asistencia con un problema en mi pedido ${orderNumber()}.`,
  () => `${getGreeting()}, ¿cómo puedo contactar con su servicio al cliente por correo electrónico? 📧`,
];

export function getRandomMessage(): string {
  const index = Math.floor(Math.random() * templates.length);
  return templates[index]();
}
