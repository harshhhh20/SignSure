# SignSure

**Digital Signature Verification System using OpenSSL**

A university cryptography project demonstrating RSA digital signatures, SHA-256 hashing, document integrity verification, and tampering detection — all running locally using OpenSSL.

---

## Features

- **RSA-2048 Digital Signatures** — Sign any document using a locally generated RSA key pair
- **SHA-256 Hashing** — Every document is hashed before signing
- **Signature Verification** — Verify authenticity and integrity of any signed document
- **Tampering Detection** — Detect even a single character change in a document
- **Wrong Public Key Attack** — Demonstrate that signatures prove *who* signed, not just integrity
- **Key Information Panel** — Inspect RSA key parameters (algorithm, key size, exponent, format)
- **Alice / Mallory / Bob Model** — Visual demonstration of the cryptographic trust model

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Python 3.x + Flask |
| Cryptography | OpenSSL 3.x |
| Storage | Local files only |

No database. No cloud services. No external APIs. Everything runs locally.

---

## Requirements

- **Python 3.8+** — [python.org](https://www.python.org)
- **OpenSSL 3.x** — [slproweb.com](https://slproweb.com/products/Win32OpenSSL.html) (Windows)
- **Git** (optional)

---

## Running the Project

### Windows (recommended)

Double-click `start.bat`

This will:
1. Verify Python and OpenSSL are installed
2. Install Python dependencies (`flask`, `flask-cors`, `werkzeug`)
3. Start the Flask server on `http://127.0.0.1:5002`
4. Open the browser automatically

### Manual start

```bash
cd backend
pip install flask flask-cors werkzeug
python app.py
```

Then open `http://127.0.0.1:5002` in your browser.

---

## Project Structure

```
signsure/
├── backend/
│   ├── app.py          # Flask API server
│   ├── keys/           # RSA key pair (generated at runtime, not committed)
│   ├── uploads/        # Temporary uploaded files
│   └── signatures/     # Generated .sig files
├── frontend/
│   ├── index.html      # Single-page application
│   ├── style.css       # Stylesheet
│   └── app.js          # Client-side logic
├── start.bat           # Windows startup script
├── .gitignore
└── README.md
```

---

## How It Works

### Signing
```
Document → SHA-256 Hash → RSA Sign (private key) → .sig file
```

### Verification
```
Document → SHA-256 Hash → RSA Verify (public key + .sig) → Authentic / Failed
```

### Tampering Detection
```
Original doc → Sign → Modify doc → Verify with original sig → FAIL
```

### Wrong Key Attack
```
Alice's doc + Alice's sig → Verify with Mallory's key → AUTHENTICITY FAILED
```

---

## Cryptography Concepts

| Concept | Description |
|---|---|
| **SHA-256** | Produces a fixed 256-bit hash. Any change to input causes completely different output (avalanche effect). |
| **RSA-2048** | Asymmetric algorithm. Private key signs, public key verifies. 2048-bit key is computationally infeasible to break. |
| **Digital Signature** | Provides Authenticity, Integrity, and Non-Repudiation. |

---

## Academic Context

This project was built as a university cryptography assignment to demonstrate practical application of:
- Public key cryptography (RSA)
- Cryptographic hash functions (SHA-256)
- Digital signature schemes
- Document integrity verification
- The Alice-Bob-Mallory trust model
