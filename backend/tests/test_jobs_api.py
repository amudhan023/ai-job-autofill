from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_rank_endpoint_orders_by_match() -> None:
    res = client.post(
        "/jobs/rank",
        json={
            "candidate": {"skills": ["Kafka", "Go"], "years_experience": 18},
            "postings": [
                {"id": "a", "title": "Staff Eng", "company": "Acme", "url": "u",
                 "required_skills": ["Kafka", "Go"], "years_required": 8},
                {"id": "b", "title": "Staff Eng", "company": "Beta", "url": "u",
                 "required_skills": ["COBOL"], "years_required": 8},
            ],
            "threshold": 0.0,
        },
    )
    assert res.status_code == 200
    ranked = res.json()
    assert ranked[0]["id"] == "a"
    assert ranked[0]["score"] >= ranked[1]["score"]
