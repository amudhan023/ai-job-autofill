"""Phase 5 job-matching endpoint. Stateless ranking of supplied postings against
a candidate profile (deterministic; no external API needed). Real provider
search (LinkedIn/Indeed) plugs in behind JobProvider when credentials exist."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.job_search import CandidateProfile, JobPosting, rank_jobs

router = APIRouter(prefix="/jobs", tags=["jobs"])


class RankRequest(BaseModel):
    candidate: CandidateProfileModel
    postings: list[JobPostingModel]
    threshold: float = 0.0


class JobPostingModel(BaseModel):
    id: str
    title: str
    company: str
    url: str
    required_skills: list[str] = []
    seniority: str = ""
    years_required: int | None = None
    sponsorship_offered: bool | None = None


class CandidateProfileModel(BaseModel):
    skills: list[str] = []
    years_experience: int = 0
    seniority: str = ""
    needs_sponsorship: bool = False


class RankedJob(BaseModel):
    id: str
    title: str
    company: str
    url: str
    score: float


@router.post("/rank", response_model=list[RankedJob])
async def rank(req: RankRequest) -> list[RankedJob]:
    candidate = CandidateProfile(
        skills=req.candidate.skills,
        years_experience=req.candidate.years_experience,
        seniority=req.candidate.seniority,
        needs_sponsorship=req.candidate.needs_sponsorship,
    )
    postings = [
        JobPosting(
            id=p.id,
            title=p.title,
            company=p.company,
            url=p.url,
            required_skills=p.required_skills,
            seniority=p.seniority,
            years_required=p.years_required,
            sponsorship_offered=p.sponsorship_offered,
        )
        for p in req.postings
    ]
    ranked = rank_jobs(postings, candidate, threshold=req.threshold)
    return [
        RankedJob(id=j.id, title=j.title, company=j.company, url=j.url, score=round(s, 4))
        for j, s in ranked
    ]


# Resolve forward references (Pydantic v2).
RankRequest.model_rebuild()
