"""Job-search integration (Phase 5).

Defines a `JobProvider` protocol so concrete sources (LinkedIn Jobs, Indeed) can
be plugged in behind one interface. A `FakeJobProvider` powers tests and local
dev. Real providers require partner API access / credentials and are added as
separate implementations without touching the orchestration logic.

Match scoring is deterministic (skill overlap + seniority/years signals), so the
"jobs matching my profile" feature works offline and is fully testable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class JobPosting:
    id: str
    title: str
    company: str
    url: str
    required_skills: list[str] = field(default_factory=list)
    seniority: str = ""
    years_required: int | None = None
    sponsorship_offered: bool | None = None


class JobProvider(Protocol):
    def search(self, query: str, limit: int = 20) -> list[JobPosting]: ...


@dataclass
class CandidateProfile:
    skills: list[str]
    years_experience: int
    seniority: str = ""
    needs_sponsorship: bool = False


def match_score(job: JobPosting, candidate: CandidateProfile) -> float:
    """Score a job against a candidate in [0,1]. Deterministic and explainable."""
    score = 0.0

    # Skill overlap (up to 0.6).
    if job.required_skills:
        have = {s.lower() for s in candidate.skills}
        overlap = sum(1 for s in job.required_skills if s.lower() in have)
        score += 0.6 * (overlap / len(job.required_skills))
    else:
        score += 0.3  # unknown requirements — neutral-ish

    # Years fit (up to 0.25).
    if job.years_required is not None:
        if candidate.years_experience >= job.years_required:
            score += 0.25
        else:
            gap = job.years_required - candidate.years_experience
            score += max(0.0, 0.25 - 0.05 * gap)
    else:
        score += 0.15

    # Sponsorship gate (up to 0.15). Hard penalty if needed but not offered.
    if candidate.needs_sponsorship:
        if job.sponsorship_offered:
            score += 0.15
        elif job.sponsorship_offered is False:
            score -= 0.3  # actively disqualifying
        # unknown → no change
    else:
        score += 0.15

    return max(0.0, min(1.0, score))


def rank_jobs(
    jobs: list[JobPosting], candidate: CandidateProfile, threshold: float = 0.0
) -> list[tuple[JobPosting, float]]:
    scored = [(j, match_score(j, candidate)) for j in jobs]
    scored = [pair for pair in scored if pair[1] >= threshold]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


class FakeJobProvider:
    """In-memory provider for tests/local dev."""

    def __init__(self, postings: list[JobPosting]) -> None:
        self._postings = postings

    def search(self, query: str, limit: int = 20) -> list[JobPosting]:
        q = query.lower()
        hits = [
            j
            for j in self._postings
            if q in j.title.lower() or any(q in s.lower() for s in j.required_skills)
        ]
        return (hits or self._postings)[:limit]
