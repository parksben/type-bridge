TypeBridge — Read Before First Launch
════════════════════════════════════════

Because TypeBridge is not yet notarized through Apple's official process,
macOS Gatekeeper will block it on the first launch with a message like
"Cannot be opened because the developer cannot be verified."

Please follow these steps to launch it for the first time:

────────────────────────────────────────
Step 1: Open Terminal
────────────────────────────────────────
Search for "Terminal" in Launchpad, or navigate to:
  Finder → Applications → Utilities → Terminal

────────────────────────────────────────
Step 2: Run the following command
(copy and paste into Terminal, then press Return)
────────────────────────────────────────

  xattr -cr /Applications/TypeBridge.app

No output means the command succeeded.

────────────────────────────────────────
Step 3: Launch the app
────────────────────────────────────────
Open Finder → Applications and double-click TypeBridge.app.

If a warning dialog still appears, right-click the app icon,
choose "Open", then click "Open" in the dialog.

════════════════════════════════════════
For help or feedback, visit: https://typebridge.parksben.xyz
════════════════════════════════════════
