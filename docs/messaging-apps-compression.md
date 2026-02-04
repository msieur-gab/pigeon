# Messaging Apps Image Compression Behavior

Research conducted: 2026-02-04

## Summary Table

| App | Default Behavior | Preserves F5 Data? | Workaround |
|-----|------------------|-------------------|------------|
| **Email** | No compression | ✅ Yes | None needed |
| **Telegram** | Compresses photos | ❌ No | Send as file/document |
| **WhatsApp** | Compresses heavily | ❌ No | Send as document |
| **Signal** | Medium compression | ⚠️ Test needed | 4K option available |
| **iMessage** | Low (Apple↔Apple) | ⚠️ Test needed | Good between Apple devices |

## Detailed Findings

### Telegram
- Compresses photos by default to optimize bandwidth
- File sharing limit: 2GB
- Acts as cloud storage (files accessible from any device)
- **Workaround:** Send as file/document instead of photo
- Can disable "Reduce file size" in Settings for original quality
- Supports 4K images without compression when sent correctly

### WhatsApp
- Compresses photos and videos by default
- File sharing limit: 2GB
- Compression is problematic for high-resolution needs
- **Workaround:** Send image as document (WhatsApp won't compress documents)
- HD option available but requires modern devices on both ends

### Signal
- Medium compression by default
- Offers 4K image option for quality preservation
- Example: 6944x9248px (11.6MB) → High quality: 3075x4096px (1.4MB) → Standard: 1201x1600px (204KB)
- **Privacy bonus:** Strips EXIF data (location, camera details) by default
- Only app that removes metadata automatically

### iMessage
- High quality between Apple devices
- Reverts to MMS quality (heavily compressed) when communicating with Android
- Not reliable for cross-platform professional use

### Email
- No compression of attachments
- Preserves original file bytes exactly
- **Best option for Pigeon** when image quality must be preserved

## Implications for Pigeon

### The Pattern
Most messaging apps:
1. **Photo mode** → Compress/re-encode images → F5 steganography data **lost**
2. **File/Document mode** → Preserve original bytes → F5 steganography data **survives**

### Recommended Approach

**For guaranteed delivery:**
- Share as `.txt` file (MIME: `text/plain`) to force document mode
- Or instruct users to "send as file" in their messaging app

**Apps likely to work with `image/jpeg`:**
- Email (confirmed)
- Signal with 4K option (needs testing)
- iMessage Apple-to-Apple (needs testing)

**Apps requiring document workaround:**
- Telegram
- WhatsApp

## Web Share API Considerations

When using the Web Share API (`navigator.share`), the receiving app decides how to handle the file based on:
- MIME type
- File extension
- App's internal logic

We cannot force "send as document" from the Web Share API. The workaround is to use a non-image MIME type (e.g., `text/plain` with `.txt` extension) so the receiving app treats it as a document.

## Sources

- [Photo Secrets Revealed: How 7 Top Messaging Apps Handle Your Images](https://www.pixduplicate.com/blog/messaging-apps-photo-handling/)
- [How to send pictures in full quality on iMessage, WhatsApp, Telegram, and Signal](https://midatlanticconsulting.com/blog/2021/12/how-to-send-pictures-in-full-quality-on-imessage-whatsapp-telegram-and-signal/)
- [Signal now beats WhatsApp in image sharing](https://www.androidpolice.com/2021/05/12/signal-now-also-beats-whatsapp-in-the-image-sharing-department/)
- [Messaging Apps Compared 2025](https://citanex.com/resources/messaging-apps-comparison-2025/)
