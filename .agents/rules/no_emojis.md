# Rule: No Emojis

Do not use emojis anywhere in the project (source code, user interface, messages, logs, comments, or documentation).

Guidelines:
1. **User Interface**: Use clean SVG icons, typography, or text badges instead of unicode emojis (e.g. use `<ShieldAlertIcon />`, `<SearchIcon />`, `[TARGET]`, `[ALERT]` instead of 🎯, ⚙️, 🔥, ⚡, 🚀, 🐱, 🤖, etc.).
2. **Text Messages & Notifications**: Format notifications and alert messages using plain text, bold/muted styling, or standard bracket tags (e.g. `[INFO]`, `[WARN]`, `[ERROR]`, `[SAVED]`).
3. **Logs & Scripts**: Use standard clean ascii prefixes (e.g. `[OK]`, `[ERROR]`, `[WARN]`, `[FTP]`).
4. **Consistency**: Keep UI clean, professional, and consistent with the design system.
