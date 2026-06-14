import os
import re
import shutil
import subprocess
import hashlib
import pathlib
import uuid
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

BASE_DIR     = pathlib.Path(__file__).parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
KEYS_DIR     = BASE_DIR / "keys"
FAKE_KEYS_DIR= KEYS_DIR / "fake"
UPLOAD_DIR   = BASE_DIR / "uploads"
SIG_DIR      = BASE_DIR / "signatures"

for d in (KEYS_DIR, FAKE_KEYS_DIR, UPLOAD_DIR, SIG_DIR):
    d.mkdir(parents=True, exist_ok=True)

PRIVATE_KEY      = KEYS_DIR / "private.pem"
PUBLIC_KEY       = KEYS_DIR / "public.pem"
FAKE_PRIVATE_KEY = FAKE_KEYS_DIR / "private.pem"
FAKE_PUBLIC_KEY  = FAKE_KEYS_DIR / "public.pem"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

OPENSSL = shutil.which("openssl") or "openssl"

def run_openssl(*args, input_data: bytes = None) -> tuple[bool, str, str]:
    cmd = [OPENSSL] + list(args)
    result = subprocess.run(
        cmd,
        input=input_data,
        capture_output=True,
        timeout=30,
    )
    return (
        result.returncode == 0,
        result.stdout.decode("utf-8", errors="replace").strip(),
        result.stderr.decode("utf-8", errors="replace").strip(),
    )

def ensure_keypair() -> bool:
    if PRIVATE_KEY.exists() and PUBLIC_KEY.exists():
        return True
    ok, _, _ = run_openssl("genrsa", "-out", str(PRIVATE_KEY), "2048")
    if not ok:
        return False
    ok, _, _ = run_openssl("rsa", "-in", str(PRIVATE_KEY), "-pubout", "-out", str(PUBLIC_KEY))
    return ok

def sha256_hex(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def file_size_str(path: pathlib.Path) -> str:
    size = path.stat().st_size
    if size < 1024:
        return f"{size} B"
    if size < 1024 ** 2:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024**2):.2f} MB"

def get_key_info(private_key_path: pathlib.Path) -> dict:
    ok, stdout, _ = run_openssl("rsa", "-in", str(private_key_path), "-text", "-noout")
    info = {
        "algorithm":   "RSA",
        "key_size":    "2048 bits",
        "exponent":    "65537",
        "format":      "PEM",
        "private_key": "Loaded" if private_key_path.exists() else "Not found",
        "public_key":  "Generated" if (private_key_path.parent / "public.pem").exists() else "Not found",
    }
    if ok:
        m = re.search(r"Private-Key:\s*\((\d+)\s*bit", stdout)
        if m:
            info["key_size"] = f"{m.group(1)} bits"
        m = re.search(r"publicExponent:\s*(\d+)", stdout)
        if m:
            info["exponent"] = m.group(1)
    return info

@app.route("/")
def index():
    return send_from_directory(str(FRONTEND_DIR), "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(str(FRONTEND_DIR), filename)

@app.route("/api/status", methods=["GET"])
def status():
    ok, ver, _ = run_openssl("version")
    keys_ready  = PRIVATE_KEY.exists() and PUBLIC_KEY.exists()
    ver_short = ver.split(" ")[1] if ok and " " in ver else ver
    return jsonify({
        "openssl_available": ok,
        "openssl_version":   ver if ok else "not found",
        "openssl_version_short": ver_short,
        "keys_ready":        keys_ready,
    })

@app.route("/api/keys/info", methods=["GET"])
def keys_info():
    if not PRIVATE_KEY.exists():
        ensure_keypair()
    if not PRIVATE_KEY.exists():
        return jsonify({"error": "Key pair not found."}), 404
    info = get_key_info(PRIVATE_KEY)
    return jsonify(info)

@app.route("/api/keys/generate", methods=["POST"])
def generate_keys():
    PRIVATE_KEY.unlink(missing_ok=True)
    PUBLIC_KEY.unlink(missing_ok=True)

    ok, _, err = run_openssl("genrsa", "-out", str(PRIVATE_KEY), "2048")
    if not ok:
        return jsonify({"error": f"Key generation failed: {err}"}), 500

    ok, _, err = run_openssl("rsa", "-in", str(PRIVATE_KEY), "-pubout", "-out", str(PUBLIC_KEY))
    if not ok:
        return jsonify({"error": f"Public key extraction failed: {err}"}), 500

    info = get_key_info(PRIVATE_KEY)
    return jsonify({
        "message": "RSA-2048 key pair generated successfully.",
        **info,
    })

@app.route("/api/keys/public", methods=["GET"])
def get_public_key():
    if not PUBLIC_KEY.exists():
        return jsonify({"error": "No key pair found. Generate keys first."}), 404
    return jsonify({"public_key": PUBLIC_KEY.read_text()})

@app.route("/api/fake-key/generate", methods=["POST"])
def generate_fake_key():
    FAKE_PRIVATE_KEY.unlink(missing_ok=True)
    FAKE_PUBLIC_KEY.unlink(missing_ok=True)

    ok, _, err = run_openssl("genrsa", "-out", str(FAKE_PRIVATE_KEY), "2048")
    if not ok:
        return jsonify({"error": f"Fake key generation failed: {err}"}), 500

    ok, _, err = run_openssl("rsa", "-in", str(FAKE_PRIVATE_KEY), "-pubout", "-out", str(FAKE_PUBLIC_KEY))
    if not ok:
        return jsonify({"error": f"Fake public key extraction failed: {err}"}), 500

    return jsonify({
        "message": "Mallory's fake RSA-2048 key pair generated.",
        "algorithm": "RSA",
        "key_size": "2048 bits",
    })

@app.route("/api/fake-key/download", methods=["GET"])
def download_fake_pubkey():
    if not FAKE_PUBLIC_KEY.exists():
        return jsonify({"error": "Fake key not generated yet."}), 404
    return send_file(str(FAKE_PUBLIC_KEY), as_attachment=True, download_name="mallory_public_key.pem")

@app.route("/api/sign", methods=["POST"])
def sign_document():
    if "document" not in request.files:
        return jsonify({"error": "No document uploaded."}), 400

    doc = request.files["document"]
    if not doc.filename:
        return jsonify({"error": "Empty filename."}), 400

    if not ensure_keypair():
        return jsonify({"error": "Failed to generate/load RSA key pair."}), 500

    session_id = uuid.uuid4().hex
    safe_name  = secure_filename(doc.filename)
    doc_path   = UPLOAD_DIR / f"{session_id}_{safe_name}"
    sig_path   = SIG_DIR / f"{session_id}.sig"

    doc.save(str(doc_path))

    ok, _, err = run_openssl(
        "dgst", "-sha256",
        "-sign",  str(PRIVATE_KEY),
        "-out",   str(sig_path),
        str(doc_path),
    )
    if not ok:
        doc_path.unlink(missing_ok=True)
        return jsonify({"error": f"Signing failed: {err}"}), 500

    doc_hash = sha256_hex(doc_path)
    sig_size = file_size_str(sig_path)

    return jsonify({
        "session_id":            session_id,
        "filename":              safe_name,
        "hash_algorithm":        "SHA-256",
        "signature_algorithm":   "RSA-2048 with SHA-256",
        "document_sha256":       doc_hash,
        "document_size":         file_size_str(doc_path),
        "signature_size":        sig_size,
        "message":               "Document signed successfully.",
    })

@app.route("/api/sign/download/<session_id>", methods=["GET"])
def download_signature(session_id):
    if not session_id.isalnum() or len(session_id) != 32:
        return jsonify({"error": "Invalid session ID."}), 400
    sig_path = SIG_DIR / f"{session_id}.sig"
    if not sig_path.exists():
        return jsonify({"error": "Signature not found."}), 404
    return send_file(str(sig_path), as_attachment=True, download_name="signature.sig")

@app.route("/api/pubkey/download", methods=["GET"])
def download_pubkey():
    if not PUBLIC_KEY.exists():
        return jsonify({"error": "Public key not found."}), 404
    return send_file(str(PUBLIC_KEY), as_attachment=True, download_name="public_key.pem")

@app.route("/api/verify", methods=["POST"])
def verify_document():
    if "document" not in request.files:
        return jsonify({"error": "No document uploaded."}), 400
    if "signature" not in request.files:
        return jsonify({"error": "No signature uploaded."}), 400

    doc = request.files["document"]
    sig = request.files["signature"]

    pub_key_path = PUBLIC_KEY
    custom_pub   = request.files.get("public_key")
    tmp_pub      = None

    session_id = uuid.uuid4().hex
    safe_doc   = secure_filename(doc.filename or "document")
    safe_sig   = secure_filename(sig.filename or "signature.sig")

    doc_path = UPLOAD_DIR / f"ver_{session_id}_{safe_doc}"
    sig_path = UPLOAD_DIR / f"ver_{session_id}_{safe_sig}"

    doc.save(str(doc_path))
    sig.save(str(sig_path))

    if custom_pub:
        tmp_pub = UPLOAD_DIR / f"ver_{session_id}_pub.pem"
        custom_pub.save(str(tmp_pub))
        pub_key_path = tmp_pub
    elif not PUBLIC_KEY.exists():
        doc_path.unlink(missing_ok=True)
        sig_path.unlink(missing_ok=True)
        return jsonify({"error": "No public key available. Please upload a public_key.pem."}), 400

    ok, stdout, stderr = run_openssl(
        "dgst", "-sha256",
        "-verify",    str(pub_key_path),
        "-signature", str(sig_path),
        str(doc_path),
    )

    doc_hash = sha256_hex(doc_path)

    doc_path.unlink(missing_ok=True)
    sig_path.unlink(missing_ok=True)
    if tmp_pub:
        tmp_pub.unlink(missing_ok=True)

    verified = ok and "Verified OK" in (stdout + stderr)

    return jsonify({
        "verified":              verified,
        "document_name":         safe_doc,
        "document_sha256":       doc_hash,
        "hash_algorithm":        "SHA-256",
        "signature_algorithm":   "RSA-2048 with SHA-256",
        "openssl_output":        (stdout or stderr).strip(),
        "message": (
            "Signature verified. Document is authentic and unmodified."
            if verified else
            "Verification failed. Document may have been tampered with or the wrong key was used."
        ),
    })

if __name__ == '__main__':
    ensure_keypair()
    app.run(debug=False, port=5002, use_reloader=False)
