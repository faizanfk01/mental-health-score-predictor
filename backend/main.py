import logging
import os
import joblib
import pandas as pd
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logger = logging.getLogger("mindscore")

model = joblib.load(Path(__file__).parent / 'mental_health_model.pkl')


ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5500").split(",")
    if origin.strip()
]
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "true").strip().lower() not in ("0", "false", "no")

app = FastAPI(
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

top_countries = ['Other','India','USA','Canada','Australia','UK','Germany','Turkey','Mexico','France']
country_lookup = {c.lower(): c for c in top_countries}

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

class StudentData(BaseModel):
    model_config = ConfigDict(extra='forbid')

    age                     : int = Field(..., ge=10, le=100)
    country                 : str = Field(..., min_length=1, max_length=60)
    gender                  : Literal['Male', 'Female']
    academic_level          : Literal['Undergraduate', 'Graduate', 'High School']
    most_used_platform      : Literal['Facebook', 'LinkedIn', 'Instagram', 'Snapchat', 'Twitter', 'YouTube', 'TikTok', 'LINE', 'KakaoTalk', 'VKontakte', 'WhatsApp','WeChat']
    purpose_of_use          : Literal['Networking', 'Education', 'Entertainment', 'News']
    avg_daily_usage_hours   : float = Field(..., ge=0, le=24)
    daily_unlocks           : int = Field(..., ge=0, le=1000)
    study_hours             : float = Field(..., ge=0, le=24)
    physical_activity_hours : float = Field(..., ge=0, le=24)
    sleep_hours_per_night   : float = Field(..., ge=0, le=24)
    stress_level            : Literal['Medium', 'Low', 'Very High', 'High']

class PredictionResponse(BaseModel):
    predicted_mental_health_score:float

@app.get('/')
def greet():
    return {"message": "Welcome to Mental Health Score Predictor"}


@app.post('/predict', response_model=PredictionResponse)
@limiter.limit("30/minute")
def predict(request: Request, data: StudentData):
    try:
        country_group = country_lookup.get(data.country.strip().lower(), "Other")
        input_row = pd.DataFrame([{
            'Age'                     : data.age,
            'Gender'                  : data.gender,
            'Academic_Level'          : data.academic_level,
            'Most_Used_Platform'      : data.most_used_platform,
            'Purpose_Of_Use'          : data.purpose_of_use,
            'Avg_Daily_Usage_Hours'   : data.avg_daily_usage_hours,
            'Daily_Unlocks'           : data.daily_unlocks,
            'Study_Hours'             : data.study_hours,
            'Physical_Activity_Hours' : data.physical_activity_hours,
            'Sleep_Hours_Per_Night'   : data.sleep_hours_per_night,
            'Stress_Level'            : data.stress_level,
            'Grouped_country'         : country_group
        }])

        prediction = model.predict(input_row)[0]
        score = round(float(prediction), 2)
    except Exception:
        # Full traceback to the server log; the client gets nothing internal.
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail="Could not produce a prediction. Please try again later.")

    return PredictionResponse(predicted_mental_health_score=score)
