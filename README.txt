Sky Courier web version

Optional: enable the shared online leaderboard

1. Create a Supabase project.
2. In the Supabase SQL Editor, run the contents of supabase.sql.
   If you already ran an earlier version, run this updated script again.
   It keeps existing best scores (assigned to Normal); historical attempts
   from before this update cannot be recovered.
3. In the Supabase dashboard, copy the Project URL and the anon/publishable
   key into config.js:

   window.SKY_COURIER_SUPABASE = {
     url: "https://YOUR-PROJECT.supabase.co",
     anonKey: "YOUR-PUBLISHABLE-OR-ANON-KEY",
   };

   The anon/publishable key is intended for browser use. Never put the
   service_role or secret key in this file. Display names, best scores, and
   submitted attempts are public. Authentication associates scores with an
   account, but browser-submitted scores are not cheat-proof.

With Supabase configured, create an account using an email, password, and
display name, then log in. If email confirmation is enabled in Supabase,
confirm the email before logging in. The game submits each run to the
account's attempt history automatically. The game-over screen has Easy,
Normal, and Hard tabs, each with a top 10 showing one best score per account;
different accounts may have equal scores. Expand "Show all attempts" to see
every attempt for that difficulty, with your own attempts highlighted.
If an online score cannot be saved, choose "Retry score" to submit that run
again.

Existing best scores are kept, but historical attempts from before the
attempt-history feature are unavailable. Without Supabase configuration, the
browser uses a local leaderboard and keeps attempt history only on that
device. The personal best is always stored on the device.

To run it locally in Google Chrome:

1. Open a terminal in this folder.
2. Run: py -3 -m http.server 8000
3. Visit: http://localhost:8000
4. Use Chrome's install button or the Install game button when it appears.

On iPhone or iPad, open the published HTTPS game in Safari, tap Share, then
choose Add to Home Screen. On Android, open it in Chrome and choose Install
app (or Add to Home screen) from the browser menu. The game supports touch
controls and can be played directly in the browser without installing it.

For public hosting on GitHub Pages, upload the contents of this web folder to
the repository's published folder (for example, its root), then enable Pages.
After visiting the HTTPS page once, install the game from Chrome's install
button or menu; the installed app can then be opened from its icon without
typing the address again. The game itself works offline after its first load;
the online leaderboard needs an internet connection.
