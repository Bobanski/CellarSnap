Mobile release artwork lives in this folder.

- `icon.png`: 1024×1024 opaque Champagne icon using the Cluster grape mark.
- `splash-icon.png`: 1024×1024 transparent Cluster grape mark for the Warm Noir splash screen.

Both are deterministically generated from the approved brand-guide geometry by
`../scripts/generate-icons.js`. Regenerate and compare the files after any brand change;
the App Store icon must remain opaque. Final artwork approval remains an owner release
sign-off rather than an engineering placeholder task.
