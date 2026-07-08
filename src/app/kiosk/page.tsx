import KioskClient from './KioskClient';

// Self-service iPad "print kiosk". Device authorised once by Adrian (admin
// password → signed kiosk_session cookie); students then pick level + topic +
// count and print a worksheet via the iPad's native AirPrint sheet
// (window.print()). No student login, no PII. See src/lib/kiosk-session.ts.
export default function KioskPage() {
  return <KioskClient />;
}
