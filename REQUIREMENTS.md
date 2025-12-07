Backseat Helper – Chrome Extension (Anforderungen)
Ziel

KI-gestützter Webseitenbegleiter mit Profilen für verschiedene KI-/OCR-Settings. Alles Vanilla JS, keine Frameworks, CSP-konform, moderne minimalistische UI.

1. Architektur & Grundstruktur

Manifest V3

Vanilla JS (kein Framework)

Kein Inline-JS (CSP-konform)

Design: modern, keine Schatten, leichte Rundungen, responsive

Dateien:

manifest.json

src/background.js (Service Worker: Profile, KI/OCR, Daten)

src/content.js (DOM-Text, Filter)

src/chat-panel.js (Chat & Debug Panel)

src/options.html, src/options.js (Profile verwalten)

src/popup.html

assets/icon-*.svg

2. Profil-System

Profilfelder:

name

ollamaUrl

model

ocrUrl (Default: http://localhost:8884/tesseract)

ocrLanguages (Default: ["deu", "eng"])

prompt

filters (regex, domInclude, domExclude)

Speicherung: chrome.storage.sync (JSON-Import/Export)

Default-Profil wird angelegt

Modell- und Serverwahl immer Teil des Profils

3. Request-Flows
Screenshot & OCR

Screenshot mit chrome.tabs.captureVisibleTab()

Umwandlung in Blob/File

POST als multipart/form-data an OCR-URL (file, options als JSON)

Nur reiner OCR-Text geht an die KI

Keine Speicherung von Bildern

DOM/Text-Fulltext

DOM mit Filtern (Regex, domInclude/Exclude)

Fulltext als Backup

Beides nur im Debug-Panel, nicht an die KI

4. Prompt-Format an die KI

Struktur:

System: <prompt aus Profil>

Content:
<OCR-Text>

User question: <User-Input, optional>


Nur diese Felder werden gesendet!

5. UI & Debug

Chat-Panel: unten, volle Breite, collapsible, Buttons für Screenshot/Senden

Debug-Panel: Umschaltbar, zeigt alle Rohdaten, inkl. OCR-Text, DOM-Text, Fulltext, Prompt, Antwort, Fehler, Zeichenanzahl

Design: Keine Schatten, border-radius, keine Fancy-Effekte

6. Technische Regeln & Sicherheit

Manifest V3, keine Inline-Skripte

Externe Scripts only

Event-Listener via JS

Try-Catch überall, userfreundliche Fehler

Timeouts: 30s pro Request

Regex: Ein Pattern, als einfacher String (flags nicht im MVP)

DOM-Include/Exclude: Mehrere Selektoren = OR (einschließend)

CORS: Alle Dienste laufen lokal, keine Auth vorgesehen (API-Key später möglich)

Speicher: Wenige Profile, daher chrome.storage.sync reicht (keine Massenprofile)

Tests/CI: MVP ohne (später evtl. Jest)

7. Install/Dev Hinweise

Chrome >88, Manifest V3

Ollama & OCR-Server lokal (keine Auth, kein CORS-Problem)

Keine Hotkeys, keine Chat-Verlauf-Speicherung

Keine Chunking/Segmentierung im MVP

8. Roadmap (Was kommt zuerst?)

Scaffold/Projektstruktur mit Manifest V3

Profile-CRUD, Speicherung, Default-Profil

Options-UI mit Profilverwaltung & Import/Export

Minimal-Chatpanel, Debug-Umschalter

Screenshot → OCR-POST (mit File!), OCR-Text an KI

Fehler/Timeouts, basic Styling, keine Schatten