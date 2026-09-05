Croma Stock Signal

This is a separate installable PWA. Deploy the folder to Vercel (or another host
that supports the /api/stock serverless route), then open the HTTPS URL on your
phone and use Install/Add to Home Screen.

The app stores the watchlist, filters and latest results in the browser's local
storage. The included serverless route is required because Croma's API does not
allow direct browser requests from a static page. Keep the route folder named
api in lowercase for Vercel; the app also falls back to API/stock for older
deployments that used an uppercase API folder.

The watch loop continues while the browser/installed app is allowed to run in
the background. If the phone suspends the app, it immediately catches up when
you return; guaranteed checks while the app is fully suspended require a
server-side scheduler or native background service.

Device access

The app creates a persistent installation Device ID; it cannot read a phone's
IMEI or hardware serial. Open the app once, copy the Device ID, and add it to
private/licenses.json before redeploying:

{
  "devices": [
    "BUYER_DEVICE_ID_1",
    "BUYER_DEVICE_ID_2",
    "BUYER_DEVICE_ID_3"
  ]
}

Add up to 50 IDs in the same list. Remove an entry to revoke access, then
redeploy. If the buyer clears app/browser data, a new Device ID is generated
and must be added.
The stock API checks the allowlist too, so an unapproved device cannot simply
skip the lock screen. An open app rechecks access every 30 seconds, and an
active stock scan locks immediately when the API returns a revoked-device response.
