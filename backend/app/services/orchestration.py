"""Multi-application orchestration (Phase 5).

Plans an "apply to N matching jobs" run as an explicit, inspectable state
machine. The plan mentions LangGraph; this is a dependency-light equivalent with
the same shape (nodes + transitions) that can be swapped for LangGraph later.

CRITICAL INVARIANT — preserved here: the orchestrator NEVER submits. Every
application halts at `AWAIT_USER_REVIEW`; only an explicit user approval advances
it to `SUBMITTED_BY_USER`. This keeps the zero-mutation / Chrome-Web-Store
compliance guarantee at the orchestration layer too.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from app.services.job_search import CandidateProfile, JobPosting, rank_jobs


class StepState(StrEnum):
    PENDING = "PENDING"
    OPENED = "OPENED"
    FILLED = "FILLED"
    AI_ANSWERED = "AI_ANSWERED"
    AWAIT_USER_REVIEW = "AWAIT_USER_REVIEW"
    SUBMITTED_BY_USER = "SUBMITTED_BY_USER"
    SKIPPED = "SKIPPED"


# Automated transitions the orchestrator may perform on its own. Note the chain
# deliberately STOPS at AWAIT_USER_REVIEW — there is no automated edge out of it.
_AUTO_NEXT: dict[StepState, StepState] = {
    StepState.PENDING: StepState.OPENED,
    StepState.OPENED: StepState.FILLED,
    StepState.FILLED: StepState.AI_ANSWERED,
    StepState.AI_ANSWERED: StepState.AWAIT_USER_REVIEW,
}


@dataclass
class ApplicationStep:
    job: JobPosting
    score: float
    state: StepState = StepState.PENDING

    def advance(self) -> bool:
        """Advance one automated step. Returns False if at a terminal/blocked state."""
        nxt = _AUTO_NEXT.get(self.state)
        if nxt is None:
            return False
        self.state = nxt
        return True

    def approve(self) -> None:
        """User approval — the only path to submission."""
        if self.state is not StepState.AWAIT_USER_REVIEW:
            raise ValueError(f"cannot approve from state {self.state}")
        self.state = StepState.SUBMITTED_BY_USER

    def skip(self) -> None:
        self.state = StepState.SKIPPED


@dataclass
class ApplicationPlan:
    steps: list[ApplicationStep] = field(default_factory=list)

    def run_until_review(self) -> None:
        """Drive every step through automation up to the human gate."""
        for step in self.steps:
            while step.advance():
                pass

    @property
    def awaiting_review(self) -> list[ApplicationStep]:
        return [s for s in self.steps if s.state is StepState.AWAIT_USER_REVIEW]

    @property
    def submitted(self) -> list[ApplicationStep]:
        return [s for s in self.steps if s.state is StepState.SUBMITTED_BY_USER]


def build_plan(
    jobs: list[JobPosting],
    candidate: CandidateProfile,
    max_applications: int = 10,
    threshold: float = 0.5,
) -> ApplicationPlan:
    """Rank jobs and build a plan for the top `max_applications` above threshold."""
    ranked = rank_jobs(jobs, candidate, threshold=threshold)[:max_applications]
    return ApplicationPlan(steps=[ApplicationStep(job=j, score=s) for j, s in ranked])
