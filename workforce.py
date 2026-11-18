"""Synthetic workforce / HR sample data for the dashboard's Workforce tab.

Models ~1,300 staff over two years (Nov 2024 – Nov 2026): hires, leavers, absence, pay,
engagement and open vacancies. Generated at import with a fixed seed.
"""

import numpy as np
import pandas as pd

AS_OF = pd.Timestamp("2026-11-02")
WINDOW_START = pd.Timestamp("2024-11-01")

DEPARTMENTS = ["Engineering", "Operations", "Sales", "Customer Success", "Finance", "People"]
DEPT_P = [0.28, 0.24, 0.17, 0.15, 0.09, 0.07]
DEPT_TURNOVER = {"Engineering": 0.11, "Operations": 0.16, "Sales": 0.22,  # chance of leaving per year
                 "Customer Success": 0.18, "Finance": 0.09, "People": 0.12}
DEPT_ABSENCE = {"Engineering": 0.55, "Operations": 1.05, "Sales": 0.70,  # days lost per person-month
                "Customer Success": 0.90, "Finance": 0.50, "People": 0.62}
DEPT_PAY = {"Engineering": 1.18, "Operations": 0.92, "Sales": 1.02,
            "Customer Success": 0.94, "Finance": 1.08, "People": 0.98}
DEPT_ENGAGEMENT = {"Engineering": 74, "Operations": 63, "Sales": 68,
                   "Customer Success": 66, "Finance": 76, "People": 79}
DEPT_TIME_TO_HIRE = {"Engineering": 52, "Operations": 34, "Sales": 41,
                     "Customer Success": 36, "Finance": 45, "People": 39}

LOCATIONS = ["London", "Edinburgh", "Manchester", "Remote"]
LOCATION_P = [0.38, 0.24, 0.22, 0.16]
GENDERS = ["Female", "Male", "Not stated"]
GENDER_P = [0.51, 0.47, 0.02]
BANDS = ["Band 1", "Band 2", "Band 3", "Band 4", "Band 5", "Band 6"]
BAND_SALARY = [26_000, 34_000, 44_000, 57_000, 74_000, 98_000]
REASONS = ["Career progression", "Pay & benefits", "Work-life balance", "Relocation",
           "End of contract", "Retirement", "Dismissal"]
REASON_P = [0.31, 0.21, 0.16, 0.12, 0.09, 0.07, 0.04]
AGE_BANDS = ["<25", "25–29", "30–34", "35–39", "40–44", "45–49", "50–54", "55–59", "60+"]

rng = np.random.default_rng(11)


def _employees() -> pd.DataFrame:
    n_existing, n_new = 1050, 540
    n = n_existing + n_new
    window_days = (AS_OF - WINDOW_START).days

    tenure_days = np.clip(rng.exponential(5 * 365, n_existing), 30, 25 * 365).astype(int)
    # New hires lean later in the window: the company is growing.
    t = np.where(rng.random(n_new) < 0.6, rng.random(n_new), rng.triangular(0, 1, 1, n_new))
    hire = np.concatenate([
        WINDOW_START - pd.to_timedelta(tenure_days, unit="D"),
        WINDOW_START + pd.to_timedelta((t * window_days).astype(int), unit="D"),
    ])

    dept = rng.choice(DEPARTMENTS, n, p=DEPT_P)
    rate = -np.log(1 - np.vectorize(DEPT_TURNOVER.get)(dept))
    start = np.maximum(hire, np.datetime64(WINDOW_START))
    leave = pd.Series(start + pd.to_timedelta(rng.exponential(365 / rate).astype(int), unit="D"))
    leave[leave > AS_OF] = pd.NaT

    gender = rng.choice(GENDERS, n, p=GENDER_P)
    age = np.where(np.arange(n) < n_existing, rng.normal(42, 10, n), rng.normal(33, 8, n))
    age = np.clip(age, 19, 66).round().astype(int)
    band = np.clip(np.round(rng.normal((age - 20) / 8.5, 1.0) - 0.3 * (gender == "Female")), 0, 5).astype(int)
    salary = (np.array(BAND_SALARY)[band] * np.vectorize(DEPT_PAY.get)(dept)
              * rng.lognormal(0, 0.07, n)).round(-2)
    part_time = rng.random(n) < np.where(gender == "Female", 0.24, 0.10)
    fte = np.where(part_time, rng.choice([0.4, 0.5, 0.6, 0.8], n), 1.0)

    leaver = leave.notna().to_numpy()
    return pd.DataFrame({
        "id": np.arange(1, n + 1),
        "department": dept,
        "location": rng.choice(LOCATIONS, n, p=LOCATION_P),
        "gender": gender,
        "age": age,
        "age_band": pd.cut(age, [0, 24, 29, 34, 39, 44, 49, 54, 59, 200], labels=AGE_BANDS).astype(str),
        "band": np.array(BANDS)[band],
        "salary": salary,
        "fte": fte,
        "hire_date": pd.to_datetime(hire),
        "leave_date": leave,
        "leave_reason": np.where(leaver, rng.choice(REASONS, n, p=REASON_P), None),
        "engagement": np.clip(rng.normal(np.vectorize(DEPT_ENGAGEMENT.get)(dept), 12), 0, 100).round(),
        "time_to_hire": np.where(np.arange(n) >= n_existing,
                                 np.clip(rng.normal(np.vectorize(DEPT_TIME_TO_HIRE.get)(dept), 10), 14, None).round(),
                                 np.nan),
    })


def _absence(emp: pd.DataFrame) -> pd.DataFrame:
    """Days lost to sickness per employee per complete month (Nov 2024 – Oct 2026)."""
    rows = []
    for month in pd.date_range(WINDOW_START, AS_OF, freq="MS")[:-1]:
        month_end = month + pd.offsets.MonthEnd(0)
        active = emp[(emp["hire_date"] <= month_end)
                     & (emp["leave_date"].isna() | (emp["leave_date"] >= month))]
        season = (1 + 0.35 * np.cos(2 * np.pi * (month.month - 1) / 12)) * rng.normal(1, 0.08)  # winter peak + noise
        base = active["department"].map(DEPT_ABSENCE).to_numpy() * season * active["fte"].to_numpy()
        rows.append(pd.DataFrame({
            "month": month,
            "department": active["department"].to_numpy(),
            "location": active["location"].to_numpy(),
            "days_lost": rng.poisson(base),
            "days_available": 21 * active["fte"].to_numpy(),
        }))
    return pd.concat(rows, ignore_index=True)


def _vacancies() -> pd.DataFrame:
    return pd.DataFrame([
        {"department": d, "location": loc, "open_roles": int(rng.poisson(40 * p * lp))}
        for d, p in zip(DEPARTMENTS, DEPT_P) for loc, lp in zip(LOCATIONS, LOCATION_P)
    ])


EMPLOYEES = _employees()
ABSENCE = _absence(EMPLOYEES)
VACANCIES = _vacancies()
MONTH_ENDS = pd.date_range(WINDOW_START, AS_OF, freq="ME")  # Nov 2024 – Oct 2026 snapshots
