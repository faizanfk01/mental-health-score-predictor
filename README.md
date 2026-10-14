# Mental Health Score

A small machine-learning demo that estimates a student wellbeing score (0–10, higher is
better) from everyday habits: social media use, phone unlocks, study hours, physical
activity, sleep and self-reported stress.

A FastAPI service wraps a scikit-learn regression pipeline and serves predictions to a
plain HTML/CSS/JavaScript frontend — no build step, no frameworks.

## Structure

```
Mental Health Score/
├── backend/
│   ├── main.py                   FastAPI app: GET / and POST /predict
│   ├── mental_health_model.pkl   trained pipeline (joblib)
│   └── requirements.txt
├── frontend/
│   ├── index.html                single-column form
│   ├── styles.css
│   └── app.js                    validation, fetch, result rendering
├── notebooks/
│   └── model_training.ipynb      data exploration, model selection, export
├── data/
│   └── student_mental_health.csv training data
└── .venv/                        local virtual environment (not committed)
```

## Running locally

Two terminals, both from the project root.

**Backend** — install dependencies once, then start the API on port 8000:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

**Frontend** — serve the static files on port 5500:

```powershell
python -m http.server 5500 --directory frontend
```

Then open <http://localhost:5500>.

### Environment variables

Both are optional — the defaults suit local development.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `http://localhost:5500` | Comma-separated origins permitted to call the API (CORS). Requests from anywhere else are refused by the browser. |
| `ENABLE_DOCS` | `true` | Set to `0`, `false` or `no` to hide `/docs`, `/redoc` and `/openapi.json`. |

Serving the frontend on a different port means telling the API about it, and
updating `connect-src` in the `Content-Security-Policy` meta tag in
`frontend/index.html` if you also move the API:

```powershell
$env:ALLOWED_ORIGINS = "http://localhost:5500,http://localhost:3000"
$env:ENABLE_DOCS = "false"
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

`/predict` is rate limited to **30 requests per minute per IP**; exceeding that
returns `429` and the frontend shows a "too many requests" message.

Serve the frontend over HTTP rather than opening `index.html` directly — a `file://`
origin is rejected by some browsers even though the API allows all origins. The API base
URL is a single constant at the top of `frontend/app.js`.

Interactive API docs are at <http://localhost:8000/docs>.

## API

`POST /predict` takes the twelve fields validated in `backend/main.py` (age, country,
gender, academic level, most used platform, purpose of use, average daily usage hours,
daily unlocks, study hours, physical activity hours, sleep hours per night, stress level)
and returns:

```json
{ "predicted_mental_health_score": 5.85 }
```

Out-of-range or misspelled values return a 422 with per-field details in `detail[]`.

## Model results

| Model | Metric | Score |
| --- | --- | --- |
| Linear Regression | Test R² | 0.74 |
| Random Forest | 5-fold CV R² | 0.852 ± 0.007 |

Random Forest was selected. Hyperparameter tuning confirmed the default settings — no
meaningful gain over the baseline configuration.

### Limitations

- **The dataset is likely synthetic.** Feature–target correlations are implausibly strong
  for self-reported wellbeing data, so the headline R² overstates real-world accuracy.
- **Stress level may overlap with the target.** It is plausibly a proxy for the mental
  health score rather than an independent predictor, which would inflate performance.
- **Predictions outside the training ranges are unreliable.** The model extrapolates
  poorly, and inputs the training data never contained will still return a confident-looking
  number.

For learning purposes only, not a medical assessment.
