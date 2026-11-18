# Pigeon — design lessons

Principles learned while building and testing Pigeon. Each one should shape
later decisions; when a proposal goes against one, say so.

## One way that fits them all (18 Nov 2026)

If invites travel one way (resistant to the re-encoding of messaging apps, so
the share button works) and messages another (fragile, so they must be saved
and attached as a file), people will use the same share button for both, and
their messages will break. Different encodings or different ways of sending
confuse people.

So Pigeon needs **one single way** to send everything, and people need to
adopt its rules upfront. Those rules must be simple: if every send means
downloading the image and re-uploading it as a file in Telegram or WhatsApp,
only people with a real need for privacy and security will bother. Everyone
else won't use it.

The refinement work is here: find the one way that fits every message, invite
and recipient.

Context: an invite shared to Telegram with the share button arrived
compressed and unreadable. F5 (the current method) can't survive any
re-encoding; a block-brightness method (like Phasm's Fortress mode) survives
WhatsApp-level compression in tests, with less room (~600 characters at
1280 px).
