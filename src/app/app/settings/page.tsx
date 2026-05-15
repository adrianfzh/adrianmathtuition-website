// TODO PORTAL: Build /app/settings.
//
// Sections:
// 1. Account: email (read-only), display name (editable), level (read-only,
//    pulled from Airtable Students)
// 2. Security: change password (current + new + confirm), Google OAuth status
// 3. Telegram link: paste Telegram chat ID OR show "/link" command instructions
//    to send to the bot. Once linked, show "✓ Linked to @username".
// 4. Notifications: toggle email digest preferences
// 5. PWA: "Add to Home Screen" instructions for iOS/Android
// 6. Danger zone: "Log out everywhere" (revoke all sessions), "Delete account"

export default function SettingsPage() {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <p className="text-sm text-gray-600">
        {/* TODO PORTAL: build settings sections */}
        Settings coming soon. See PORTAL.md.
      </p>
    </div>
  );
}
