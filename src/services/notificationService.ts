export async function sendConfirmation(
  customerName: string,
  phone: string,
  reservationId: number,
  restaurantName: string,
  startTime: Date,
  partySize: number
) {
  const message = `[RESERVATION CONFIRMED] Hi ${customerName}, your reservation (ID: ${reservationId}) at ${restaurantName} for ${partySize} people is confirmed at ${startTime.toISOString()}. Contact: ${phone}`;
  console.log(`[NOTIFICATION] ${message}`);
  // In production, integrate with Twilio (SMS), SendGrid (email), or similar
  return { success: true, message };
}

export async function sendCancellation(
  customerName: string,
  phone: string,
  reservationId: number,
  restaurantName: string
) {
  const message = `[RESERVATION CANCELLED] Hi ${customerName}, your reservation (ID: ${reservationId}) at ${restaurantName} has been cancelled. Contact: ${phone}`;
  console.log(`[NOTIFICATION] ${message}`);
  return { success: true, message };
}

export async function sendWaitlistNotification(
  customerName: string,
  phone: string,
  restaurantName: string,
  partySize: number,
  preferredDate: string
) {
  const message = `[WAITLIST] Hi ${customerName}, you've been added to the waitlist at ${restaurantName} for ${partySize} people on ${preferredDate}. We'll contact you if a table becomes available. Contact: ${phone}`;
  console.log(`[NOTIFICATION] ${message}`);
  return { success: true, message };
}
