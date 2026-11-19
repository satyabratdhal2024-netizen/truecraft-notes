TRUECRAFT NOTES — QUICK SETUP (2 MINUTES)
=========================================

1. GET YOUR 16-LETTER GMAIL APP PASSWORD
   - Go to Google Account -> Security -> turn on 2-Step Verification.
   - Open https://myaccount.google.com/apppasswords
   - Name it "TrueCraft", click Create, and copy the 16-letter password.

2. PASTE IT INTO ".env"
   - Open the ".env" file in this folder (with Notepad or VS Code).
   - Replace PASTE_YOUR_16_LETTER_APP_PASSWORD_HERE with your 16-letter App Password.
   - Save and close. (Your Gmail is already filled in as truecraftnotes.ss@gmail.com.)

3. TEST & RUN
   - Double-click "Test_email.cmd" to verify a test email arrives in your Gmail.
   - Double-click "Start_site.cmd" and open http://localhost:4318 in your browser.

IMPORTANT
- Always open http://localhost:4318 (never double-click public/index.html directly).
- Every customer order is emailed to truecraftnotes.ss@gmail.com with files attached,
  and also backed up in the "orders" folder automatically.
- Keep ".env" private. Never share it with anyone.
