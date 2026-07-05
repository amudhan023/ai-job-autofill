"""Phase 5 — job matching + orchestration tests (deterministic)."""

from __future__ import annotations

import pytest

from app.services.job_search import (
    CandidateProfile,
    FakeJobProvider,
    JobPosting,
    match_score,
    rank_jobs,
)
from app.services.orchestration import StepState, build_plan


def job(**kw) -> JobPosting:
    base = dict(id="j", title="Staff Engineer", company="Acme", url="https://x")
    base.update(kw)
    return JobPosting(**base)  # type: ignore[arg-type]


# ---- matching ------------------------------------------------------------- #


def test_match_score_rewards_skill_overlap() -> None:
    cand = CandidateProfile(skills=["Kafka", "Go"], years_experience=18)
    strong = job(required_skills=["Kafka", "Go"], years_required=8)
    weak = job(required_skills=["Rust", "Elixir"], years_required=8)
    assert match_score(strong, cand) > match_score(weak, cand)


def test_match_score_penalizes_missing_sponsorship() -> None:
    cand = CandidateProfile(skills=["Kafka"], years_experience=10, needs_sponsorship=True)
    no_sponsor = job(required_skills=["Kafka"], sponsorship_offered=False)
    yes_sponsor = job(required_skills=["Kafka"], sponsorship_offered=True)
    assert match_score(yes_sponsor, cand) > match_score(no_sponsor, cand)


def test_rank_jobs_orders_and_filters_by_threshold() -> None:
    cand = CandidateProfile(skills=["Kafka", "Go"], years_experience=18)
    jobs = [
        job(id="a", required_skills=["Kafka", "Go"], years_required=8),
        job(id="b", required_skills=["Rust"], years_required=8),
    ]
    ranked = rank_jobs(jobs, cand, threshold=0.5)
    assert ranked[0][0].id == "a"
    assert all(score >= 0.5 for _, score in ranked)


def test_fake_provider_search_filters_by_query() -> None:
    provider = FakeJobProvider([job(id="a", title="Staff Engineer"), job(id="b", title="Designer")])
    hits = provider.search("engineer")
    assert [h.id for h in hits] == ["a"]


# ---- orchestration -------------------------------------------------------- #


def test_build_plan_selects_top_matches() -> None:
    cand = CandidateProfile(skills=["Kafka", "Go"], years_experience=18)
    jobs = [
        job(id="a", required_skills=["Kafka", "Go"], years_required=8),
        job(id="b", required_skills=["Kafka"], years_required=8),
        job(id="c", required_skills=["COBOL"], years_required=8),
    ]
    plan = build_plan(jobs, cand, max_applications=2, threshold=0.5)
    assert len(plan.steps) == 2
    assert plan.steps[0].job.id == "a"


def test_plan_halts_at_user_review_and_never_auto_submits() -> None:
    cand = CandidateProfile(skills=["Kafka", "Go"], years_experience=18)
    plan = build_plan([job(required_skills=["Kafka", "Go"], years_required=8)], cand)
    plan.run_until_review()

    # Automation stops at the human gate — nothing is submitted automatically.
    assert len(plan.awaiting_review) == 1
    assert len(plan.submitted) == 0
    assert plan.steps[0].state is StepState.AWAIT_USER_REVIEW


def test_only_explicit_user_approval_submits() -> None:
    cand = CandidateProfile(skills=["Kafka", "Go"], years_experience=18)
    plan = build_plan([job(required_skills=["Kafka", "Go"], years_required=8)], cand)
    plan.run_until_review()

    plan.steps[0].approve()
    assert plan.steps[0].state is StepState.SUBMITTED_BY_USER
    assert len(plan.submitted) == 1


def test_cannot_approve_before_review_gate() -> None:
    cand = CandidateProfile(skills=["Kafka"], years_experience=18)
    plan = build_plan([job(required_skills=["Kafka"], years_required=8)], cand)
    # step is PENDING, not yet at the review gate
    with pytest.raises(ValueError):
        plan.steps[0].approve()
