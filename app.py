
import base64
import io
import json
import os
import re
import sqlite3
import time
import wave
from contextlib import closing
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import requests
from flask import Flask, Response, jsonify, request, send_from_directory

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:  # python-dotenv is optional
    pass

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR") or BASE_DIR)
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "cropcare.db"

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-flash-latest")
TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Kore")
USE_SEARCH = os.getenv("USE_SEARCH", "1") != "0"
RATE_LIMIT = int(os.getenv("RATE_LIMIT", "40"))  # AI requests per IP per 10 minutes
API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

LANGS = {
    "en": ("English", "English"),
    "am": ("Amharic", "አማርኛ (Ethiopic script)"),
    "om": ("Afaan Oromo", "Afaan Oromoo (Latin script)"),
    "ti": ("Tigrinya", "ትግርኛ (Ethiopic script)"),
    "so": ("Somali", "Soomaali (Latin script)"),
}

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
app.json.ensure_ascii = False

# --------------------------------------------------------------------------- #
# Static files (served straight from this folder)
# --------------------------------------------------------------------------- #
PUBLIC_FILES = {"index.html", "style.css", "script.js"}


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:name>")
def public_file(name):
    if name not in PUBLIC_FILES:
        return jsonify(error="Not found"), 404
    resp = send_from_directory(BASE_DIR, name)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
class GeminiError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


_hits = {}


def client_ip():
    fwd = request.headers.get("X-Forwarded-For", "")
    return (fwd.split(",")[0].strip() or request.remote_addr or "unknown")


def rate_ok():
    now = time.time()
    ip = client_ip()
    recent = [t for t in _hits.get(ip, []) if now - t < 600]
    if len(recent) >= RATE_LIMIT:
        _hits[ip] = recent
        return False
    recent.append(now)
    _hits[ip] = recent
    return True


def api(fn):
    """Wrap a route: rate limit AI calls and turn errors into clean JSON."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ApiError as e:
            return jsonify(error=str(e)), e.status
        except GeminiError as e:
            msg = str(e)
            if e.status in (400, 401, 403) and "api key" in msg.lower():
                msg = "The Gemini API key is missing or invalid. Check GEMINI_API_KEY in your .env file."
            elif e.status == 429:
                msg = "The AI service is busy or the quota is used up. Please wait a minute and try again."
            return jsonify(error=msg), 502 if e.status >= 500 else 400
        except Exception as e:  # noqa: BLE001
            app.logger.exception("Unhandled error")
            return jsonify(error=f"Unexpected server error: {e}"), 500
    return wrapper


def ai_route(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not API_KEY:
            raise ApiError("GEMINI_API_KEY is not set. Add it to your .env file and restart the server.", 503)
        if not rate_ok():
            raise ApiError("Too many requests. Please wait a few minutes and try again.", 429)
        return fn(*args, **kwargs)
    return wrapper


def device_id():
    raw = request.headers.get("X-Device-Id", "")
    return re.sub(r"[^A-Za-z0-9-]", "", raw)[:64] or "anonymous"


def lang_code(value):
    return value if value in LANGS else "en"


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def extract_json(text):
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I).strip()
    try:
        return json.loads(t)
    except (ValueError, TypeError):
        pass
    m = re.search(r"\{.*\}", t, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------- #
# Gemini
# --------------------------------------------------------------------------- #
def _post(model, body, timeout=120):
    url = f"{API_ROOT}/{model}:generateContent"
    headers = {"x-goog-api-key": API_KEY, "Content-Type": "application/json"}
    last = GeminiError("Unknown AI error")
    for attempt in range(3):
        try:
            r = requests.post(url, headers=headers, json=body, timeout=timeout)
        except requests.RequestException as e:
            last = GeminiError(f"Network error while contacting Gemini: {e}", 502)
            time.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 200:
            return r.json()
        try:
            msg = r.json()["error"]["message"]
        except Exception:  # noqa: BLE001
            msg = r.text[:200]
        last = GeminiError(msg, r.status_code)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(1.5 * (attempt + 1))
            continue
        break
    raise last


def generate(parts, system, history=None, search=False, json_mode=False, temperature=0.4):
    """Call Gemini, falling back to a second model when the first is unavailable."""
    contents = list(history or []) + [{"role": "user", "parts": parts}]
    cfg = {"temperature": temperature}
    if json_mode:
        cfg["responseMimeType"] = "application/json"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": cfg,
    }
    if search and USE_SEARCH:
        body["tools"] = [{"google_search": {}}]

    data = None
    for i, model in enumerate([m for m in (MODEL, FALLBACK_MODEL) if m]):
        try:
            data = _post(model, body)
            break
        except GeminiError as e:
            if i == 0 and FALLBACK_MODEL and FALLBACK_MODEL != MODEL and e.status in (404, 429, 500, 502, 503, 504):
                continue
            raise
    if data is None:
        raise GeminiError("The AI service did not respond.", 502)

    if data.get("promptFeedback", {}).get("blockReason"):
        raise GeminiError("The request was blocked by the AI safety filter. Try a different photo or question.", 400)
    cands = data.get("candidates") or []
    if not cands:
        raise GeminiError("The AI returned no answer. Please try again.", 502)
    cand = cands[0]
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    sources, seen = [], set()
    for ch in cand.get("groundingMetadata", {}).get("groundingChunks", []) or []:
        web = ch.get("web") or {}
        uri = web.get("uri")
        if uri and uri not in seen:
            seen.add(uri)
            sources.append({"title": web.get("title") or uri, "url": uri})
    return text.strip(), sources[:6]


def system_prompt(lang, kind):
    name, script = LANGS[lang_code(lang)]
    return f"""You are CropCare AI, an expert agronomist and plant pathologist helping farmers worldwide, with special care for smallholder farmers in Ethiopia and East Africa.

LANGUAGE: Write everything the farmer will read in {name} ({script}). Use simple, short, farmer-friendly sentences and common words. Keep crop, pest, disease and chemical names understandable: you may add the English or scientific name in brackets when helpful.

RULES
- Be accurate, practical and honest about uncertainty. Never invent facts, statistics, product names or registrations.
- Prefer low-cost, locally practical advice first: field hygiene, resistant varieties, crop rotation, spacing, irrigation timing, balanced fertilizer, scouting.
- For chemical control, name only active-ingredient types or well-known active ingredients, tell the farmer to follow the product label, wear protective clothing, respect pre-harvest intervals, and confirm that a product is registered and available with the local agriculture office or development agent. Never claim a brand is registered unless you verified it.
- Use the farmer's crop, growth stage, region and weather to personalise advice; do not give one generic answer.
- Mention when a problem needs an expert (rapid spread, unclear cause, high value crop, possible quarantine pest).
- Use trusted sources (FAO, CABI, university extension, national research institutes such as EIAR) when you search.
- {"Return ONLY one valid JSON object, no markdown fences, no extra text." if kind == "diagnose" else "Answer conversationally and briefly. Use short bullet points with - when listing steps. No headings."}"""


def format_context(ctx, weather=None):
    ctx = ctx or {}
    lines = []
    for key, label in (("crop", "Crop"), ("part", "Plant part"), ("stage", "Growth stage"), ("region", "Region/location")):
        if ctx.get(key):
            lines.append(f"{label}: {str(ctx[key])[:80]}")
    w = weather if weather is not None else ctx.get("weather")
    if isinstance(w, dict) and w:
        lines.append(
            "Weather now/last 7 days: "
            f"temp {w.get('temp')}°C, humidity {w.get('humidity')}%, rain last 7 days {w.get('rain_7d')} mm, "
            f"rain forecast next days {w.get('rain_forecast')} mm, fungal disease risk {w.get('fungal_risk')}"
            + (f"; notes: {'; '.join(w.get('notes', []))}" if w.get("notes") else "")
        )
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Database (per-browser history using an anonymous device id)
# --------------------------------------------------------------------------- #
def db_run(sql, args=(), many=False, one=False, commit=False):
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(sql, args)
        if commit:
            conn.commit()
            return cur.lastrowid
        if one:
            return cur.fetchone()
        return cur.fetchall()


def init_db():
    db_run(
        """CREATE TABLE IF NOT EXISTS diagnoses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            crop TEXT, part TEXT, stage TEXT, region TEXT, symptoms TEXT,
            problem TEXT, status TEXT, severity TEXT, confidence INTEGER,
            language TEXT, thumb TEXT, result_json TEXT NOT NULL
        )""",
        commit=True,
    )
    db_run("CREATE INDEX IF NOT EXISTS idx_dx_device ON diagnoses(device_id, id DESC)", commit=True)


init_db()

# --------------------------------------------------------------------------- #
# Routes: health & weather
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return jsonify(ok=True, has_key=bool(API_KEY), model=MODEL, languages=list(LANGS))


def mean(values):
    vals = [v for v in values if isinstance(v, (int, float))]
    return sum(vals) / len(vals) if vals else None


def build_weather(lat, lon, label):
    r = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
            "past_days": 7,
            "forecast_days": 4,
            "timezone": "auto",
        },
        timeout=20,
    )
    if r.status_code != 200:
        raise ApiError("Weather service is unavailable right now.", 502)
    d = r.json()
    cur, daily = d.get("current", {}), d.get("daily", {})
    precip = daily.get("precipitation_sum") or []
    tmax, tmin = daily.get("temperature_2m_max") or [], daily.get("temperature_2m_min") or []
    past_rain = round(sum(p or 0 for p in precip[:7]), 1)
    next_rain = round(sum(p or 0 for p in precip[7:]), 1)
    avg_past = mean([(a + b) / 2 for a, b in zip(tmax[:7], tmin[:7]) if a is not None and b is not None])
    hum = cur.get("relative_humidity_2m")
    temp = cur.get("temperature_2m")

    score = 0
    if hum is not None:
        score += 2 if hum >= 80 else 1 if hum >= 65 else 0
    score += 2 if past_rain >= 20 else 1 if past_rain >= 8 else 0
    if avg_past is not None and 15 <= avg_past <= 28:
        score += 1
    risk = "high" if score >= 4 else "moderate" if score >= 2 else "low"

    notes = []
    if tmax and max(x for x in tmax[7:] if x is not None) >= 35:
        notes.append("heat stress expected in the next days")
    if past_rain < 2 and next_rain < 2 and (avg_past or 0) >= 26:
        notes.append("dry and warm: drought stress possible")
    if next_rain >= 25:
        notes.append("heavy rain expected: waterlogging and spread of fungal disease")

    return {
        "location": label,
        "lat": lat,
        "lon": lon,
        "temp": temp,
        "humidity": hum,
        "wind": cur.get("wind_speed_10m"),
        "rain_7d": past_rain,
        "rain_forecast": next_rain,
        "avg_temp_7d": round(avg_past, 1) if avg_past is not None else None,
        "fungal_risk": risk,
        "notes": notes,
    }


@app.get("/api/weather")
@api
def weather():
    place = request.args.get("place", "").strip()
    try:
        if place:
            g = requests.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": place, "count": 1, "language": "en"},
                timeout=20,
            ).json()
            res = (g.get("results") or [None])[0]
            if not res:
                raise ApiError("Could not find that place. Try a nearby town name.", 404)
            label = ", ".join(x for x in (res.get("name"), res.get("admin1"), res.get("country")) if x)
            return jsonify(build_weather(res["latitude"], res["longitude"], label))
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError
        return jsonify(build_weather(lat, lon, f"{lat:.2f}, {lon:.2f}"))
    except (KeyError, ValueError):
        raise ApiError("Provide a place name or valid coordinates.", 400)
    except requests.RequestException:
        raise ApiError("Weather service is unavailable right now.", 502)


# --------------------------------------------------------------------------- #
# Routes: diagnosis
# --------------------------------------------------------------------------- #
DIAG_TEMPLATE = """{
 "is_plant": true,
 "crop": "", "plant_part": "",
 "status": "healthy | disease | pest | deficiency | stress | unclear",
 "problem_name": "", "scientific_name": "",
 "confidence": 0,
 "severity": "none | low | moderate | high | critical",
 "summary": "2-3 simple sentences for the farmer",
 "symptoms": [], "causes": [], "favourable_conditions": [],
 "treatment": {"immediate": [], "organic_cultural": [], "chemical": []},
 "prevention": [],
 "weather_advice": "", "compared_with_history": "",
 "follow_up": "what to check and when (e.g. in 3-5 days)",
 "see_expert_if": [],
 "alternatives": [{"name": "", "confidence": 0}],
 "references": [{"title": "", "source": ""}]
}"""


def as_list(v):
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [str(v).strip()] if v else []


def normalize(d, lang):
    d = d if isinstance(d, dict) else {}
    tr = d.get("treatment") if isinstance(d.get("treatment"), dict) else {}
    status = str(d.get("status", "unclear")).lower().split("|")[0].strip()
    severity = str(d.get("severity", "none")).lower().split("|")[0].strip()
    try:
        conf = max(0, min(100, int(float(d.get("confidence", 0)))))
    except (TypeError, ValueError):
        conf = 0
    alts = []
    for a in d.get("alternatives") or []:
        if isinstance(a, dict) and a.get("name"):
            try:
                ac = max(0, min(100, int(float(a.get("confidence", 0)))))
            except (TypeError, ValueError):
                ac = 0
            alts.append({"name": str(a["name"]), "confidence": ac})
    refs = []
    for r in d.get("references") or []:
        if isinstance(r, dict) and r.get("title"):
            refs.append({"title": str(r["title"]), "source": str(r.get("source", ""))})
    return {
        "is_plant": d.get("is_plant", True) is not False,
        "crop": str(d.get("crop", "") or ""),
        "plant_part": str(d.get("plant_part", "") or ""),
        "status": status if status in ("healthy", "disease", "pest", "deficiency", "stress", "unclear") else "unclear",
        "problem_name": str(d.get("problem_name", "") or ""),
        "scientific_name": str(d.get("scientific_name", "") or ""),
        "confidence": conf,
        "severity": severity if severity in ("none", "low", "moderate", "high", "critical") else "low",
        "summary": str(d.get("summary", "") or ""),
        "symptoms": as_list(d.get("symptoms")),
        "causes": as_list(d.get("causes")),
        "favourable_conditions": as_list(d.get("favourable_conditions")),
        "treatment": {
            "immediate": as_list(tr.get("immediate")),
            "organic_cultural": as_list(tr.get("organic_cultural")),
            "chemical": as_list(tr.get("chemical")),
        },
        "prevention": as_list(d.get("prevention")),
        "weather_advice": str(d.get("weather_advice", "") or ""),
        "compared_with_history": str(d.get("compared_with_history", "") or ""),
        "follow_up": str(d.get("follow_up", "") or ""),
        "see_expert_if": as_list(d.get("see_expert_if")),
        "alternatives": alts[:4],
        "references": refs[:5],
        "language": lang,
    }


@app.post("/api/diagnose")
@api
@ai_route
def diagnose():
    form = request.form
    lang = lang_code(form.get("language"))
    files = request.files.getlist("images")[:3]
    if not files:
        raise ApiError("Please add at least one crop photo.", 400)

    parts = []
    for f in files:
        data = f.read()
        if not data:
            continue
        mime = f.mimetype if (f.mimetype or "").startswith("image/") else "image/jpeg"
        parts.append({"inlineData": {"mimeType": mime, "data": b64(data)}})
    if not parts:
        raise ApiError("The photo could not be read. Please try another one.", 400)

    try:
        weather_ctx = json.loads(form.get("weather") or "null")
    except ValueError:
        weather_ctx = None
    ctx = {k: form.get(k, "").strip() for k in ("crop", "part", "stage", "region")}
    symptoms = form.get("symptoms", "").strip()[:800]

    dev = device_id()
    past_lines = ""
    if ctx["crop"]:
        rows = db_run(
            "SELECT created_at, problem, severity, status FROM diagnoses "
            "WHERE device_id=? AND LOWER(crop)=LOWER(?) ORDER BY id DESC LIMIT 3",
            (dev, ctx["crop"]),
        )
        past_lines = "\n".join(
            f"- {r['created_at'][:10]}: {r['problem'] or r['status']} (severity {r['severity']})" for r in rows
        )

    prompt = (
        "Diagnose the crop problem shown in the photo(s). If the image is not a plant or crop, set is_plant to false.\n"
        "Look carefully at leaf colour, spots, lesions, margins, pests, mould, wilting and pattern across the plant.\n"
        f"{format_context(ctx, weather_ctx)}\n"
        f"Farmer's description: {symptoms or '(none)'}\n"
        f"Earlier cases for this crop on this farm:\n{past_lines or '(none)'}\n"
        "If earlier cases exist, say in compared_with_history whether this looks like the same problem, worse or better. "
        "Use the weather to explain risk in weather_advice.\n"
        "Fill every field. Lists must contain 2-5 short items. Confidence is 0-100 and must be honest; "
        "use a low value and status 'unclear' when the photo is not enough, and say what extra photo would help.\n"
        f"Return JSON exactly in this shape (keys and status/severity values in English, all other text in {LANGS[lang][0]}):\n"
        f"{DIAG_TEMPLATE}"
    )
    parts.append({"text": prompt})
    system = system_prompt(lang, "diagnose")

    text, sources = generate(parts, system, search=True, temperature=0.3)
    data = extract_json(text)
    if data is None:  # search mode may ignore JSON-only; retry in strict JSON mode
        text, _ = generate(parts, system, json_mode=True, temperature=0.2)
        data = extract_json(text)
    if data is None:
        raise ApiError("The AI answer could not be read. Please try again with a clearer photo.", 502)

    result = normalize(data, lang)
    result["sources"] = sources
    if not result["is_plant"]:
        return jsonify(id=None, result=result)

    row_id = db_run(
        """INSERT INTO diagnoses (device_id, created_at, crop, part, stage, region, symptoms, problem, status,
           severity, confidence, language, thumb, result_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            dev,
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
            result["crop"] or ctx["crop"],
            result["plant_part"] or ctx["part"],
            ctx["stage"],
            ctx["region"],
            symptoms,
            result["problem_name"],
            result["status"],
            result["severity"],
            result["confidence"],
            lang,
            (form.get("thumb") or "")[:60000],
            json.dumps(result, ensure_ascii=False),
        ),
        commit=True,
    )
    return jsonify(id=row_id, result=result)


# --------------------------------------------------------------------------- #
# Routes: Q&A, voice
# --------------------------------------------------------------------------- #
@app.post("/api/ask")
@api
@ai_route
def ask():
    body = request.get_json(silent=True) or {}
    question = str(body.get("question", "")).strip()[:2000]
    if not question:
        raise ApiError("Please type or speak a question.", 400)
    lang = lang_code(body.get("language"))

    history = []
    for turn in (body.get("history") or [])[-10:]:
        role = "model" if turn.get("role") == "model" else "user"
        txt = str(turn.get("text", ""))[:1500]
        if txt:
            history.append({"role": role, "parts": [{"text": txt}]})
    while history and history[0]["role"] != "user":
        history.pop(0)

    ctx_text = format_context(body.get("context"))
    prompt = (f"Farm details:\n{ctx_text}\n\n" if ctx_text else "") + f"Farmer's question: {question}"
    text, sources = generate([{"text": prompt}], system_prompt(lang, "ask"), history=history, search=True)
    return jsonify(answer=text, sources=sources)


@app.post("/api/transcribe")
@api
@ai_route
def transcribe():
    audio = request.files.get("audio")
    if not audio:
        raise ApiError("No audio received.", 400)
    data = audio.read()
    if len(data) < 800:
        raise ApiError("The recording was too short. Please try again.", 400)
    lang = lang_code(request.form.get("language"))
    prompt = (
        f"Transcribe this audio exactly as spoken. The speaker most likely speaks {LANGS[lang][0]}. "
        "Use the correct script for that language (Ethiopic for Amharic and Tigrinya, Latin for Afaan Oromo and Somali). "
        "Return only the transcript text, nothing else. If there is no speech, return an empty string."
    )
    text, _ = generate(
        [{"inlineData": {"mimeType": audio.mimetype or "audio/wav", "data": b64(data)}}, {"text": prompt}],
        "You are a precise speech-to-text engine.",
        temperature=0,
    )
    return jsonify(text=text.strip().strip('"'))


def clean_for_tts(text):
    text = re.sub(r"[*#_`>]", "", text or "")
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.M)
    return re.sub(r"\s+", " ", text).strip()


@app.post("/api/tts")
@api
@ai_route
def tts():
    body = request.get_json(silent=True) or {}
    text = clean_for_tts(body.get("text"))[:1200]
    if not text:
        raise ApiError("Nothing to read.", 400)
    lang = lang_code(body.get("language"))
    payload = {
        "contents": [{"parts": [{"text": f"Read this aloud clearly and calmly in {LANGS[lang][0]}:\n\n{text}"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": TTS_VOICE}}},
        },
    }
    data = _post(TTS_MODEL, payload)
    try:
        inline = data["candidates"][0]["content"]["parts"][0]["inlineData"]
        pcm = base64.b64decode(inline["data"])
    except (KeyError, IndexError, TypeError):
        raise GeminiError("Spoken answers are not available for this language right now.", 502)
    m = re.search(r"rate=(\d+)", inline.get("mimeType", ""))
    rate = int(m.group(1)) if m else 24000
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return Response(buf.getvalue(), mimetype="audio/wav")


# --------------------------------------------------------------------------- #
# Routes: history & dashboard
# --------------------------------------------------------------------------- #
@app.get("/api/history")
@api
def history():
    rows = db_run(
        "SELECT id, created_at, crop, part, problem, status, severity, confidence, thumb "
        "FROM diagnoses WHERE device_id=? ORDER BY id DESC LIMIT 100",
        (device_id(),),
    )
    return jsonify(items=[dict(r) for r in rows])


@app.get("/api/history/<int:item_id>")
@api
def history_item(item_id):
    row = db_run("SELECT * FROM diagnoses WHERE id=? AND device_id=?", (item_id, device_id()), one=True)
    if not row:
        raise ApiError("Case not found.", 404)
    d = dict(row)
    d["result"] = json.loads(d.pop("result_json"))
    return jsonify(d)


@app.delete("/api/history/<int:item_id>")
@api
def history_delete(item_id):
    db_run("DELETE FROM diagnoses WHERE id=? AND device_id=?", (item_id, device_id()), commit=True)
    return jsonify(ok=True)


@app.get("/api/dashboard")
@api
def dashboard():
    rows = db_run(
        "SELECT created_at, crop, problem, status, severity FROM diagnoses WHERE device_id=? ORDER BY id DESC",
        (device_id(),),
    )
    problems, crops, months, severities = {}, {}, {}, {}
    for r in rows:
        if r["status"] != "healthy" and r["problem"]:
            key = f"{r['crop'] or '?'} - {r['problem']}"
            problems[key] = problems.get(key, 0) + 1
        if r["crop"]:
            crops[r["crop"]] = crops.get(r["crop"], 0) + 1
        months[r["created_at"][:7]] = months.get(r["created_at"][:7], 0) + 1
        severities[r["severity"]] = severities.get(r["severity"], 0) + 1

    def top(d, n=8):
        return [{"name": k, "count": v} for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n]]

    return jsonify(
        total=len(rows),
        problems=top(problems),
        recurring=[p for p in top(problems) if p["count"] >= 2],
        crops=top(crops),
        months=[{"name": k, "count": v} for k, v in sorted(months.items())[-6:]],
        severities=severities,
    )


if __name__ == "__main__":
    if not API_KEY:
        print("WARNING: GEMINI_API_KEY is not set. Create a .env file (see .env.example).")
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
