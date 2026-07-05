"""No-LLM regex/heuristic resume fallback — experience/education/skills extraction."""

from __future__ import annotations

from app.services.resume import _regex_parse


def test_regex_parse_extracts_experience_with_letter_month_dates() -> None:
    text = """Jane Doe
jane.doe@example.com | (415) 555-0134

EXPERIENCE

Senior Software Engineer — Acme Corp
Jan 2022 - Present
- Led migration of monolith to microservices
- Mentored 4 junior engineers

Software Engineer — Globex Inc
Jun 2019 - Dec 2021
- Built internal analytics dashboard
"""
    profile = _regex_parse(text)
    assert len(profile.experience) == 2

    latest = profile.experience[0]
    assert latest.company == "Acme Corp"
    assert latest.title == "Senior Software Engineer"
    assert latest.startDate == "2022-01"
    assert latest.endDate == ""
    assert latest.current is True
    assert latest.bullets == [
        "Led migration of monolith to microservices",
        "Mentored 4 junior engineers",
    ]

    prior = profile.experience[1]
    assert prior.company == "Globex Inc"
    assert prior.title == "Software Engineer"
    assert prior.startDate == "2019-06"
    assert prior.endDate == "2021-12"
    assert prior.current is False


def test_regex_parse_extracts_experience_with_numeric_mm_yyyy_dates() -> None:
    # "Company, Title" order + "MM/YYYY – Present" numeric dates (a common ATS
    # export format) — regression test for the leading "05/" leaking into the
    # header text and corrupting the company/title split.
    text = """Amudhan Shanmugam
amudhan@example.com

EXPERIENCE

American Express, Senior Software Engineer

05/2023 – Present  |  Remote, TX

•Architected a real-time streaming platform using Kafka and Flink.

General Motors, Java Tech Lead

2014 – 2016  |  Phoenix, AZ

EDUCATION
"""
    profile = _regex_parse(text)
    assert len(profile.experience) == 2

    latest = profile.experience[0]
    assert latest.company == "American Express"
    assert latest.title == "Senior Software Engineer"
    assert latest.startDate == "2023-05"
    assert latest.current is True
    assert latest.bullets == ["Architected a real-time streaming platform using Kafka and Flink."]

    older = profile.experience[1]
    assert older.company == "General Motors"
    assert older.title == "Java Tech Lead"
    assert older.startDate == "2014"
    assert older.endDate == "2016"
    assert older.current is False


def test_regex_parse_extracts_education_school_on_same_line() -> None:
    text = """Jane Doe

EDUCATION

B.S. Computer Science — University of California, Berkeley
Graduated 2019
"""
    profile = _regex_parse(text)
    assert len(profile.education) == 1
    edu = profile.education[0]
    assert edu.school == "University of California, Berkeley"
    assert edu.degree == "B.S."
    assert edu.major == "Computer Science"
    assert edu.year == "2019"


def test_regex_parse_extracts_education_school_on_following_line() -> None:
    # "Degree - Major" with the institution name on its own line below —
    # regression test for the school/major mix-up when neither half of the
    # degree line reads as an institution name.
    text = """Amudhan Shanmugam

EDUCATION

Bachelor of Engineering - Electrical and Electronics,

04/2008  |  Chennai, India

Anna University
"""
    profile = _regex_parse(text)
    assert len(profile.education) == 1
    edu = profile.education[0]
    assert edu.school == "Anna University"
    assert edu.degree == "Bachelor"
    assert "Electrical and Electronics" in edu.major
    assert edu.year == "2008"


def test_regex_parse_extracts_skills_with_category_prefixes() -> None:
    text = """Jane Doe

SKILLS

Languages & Backend: Java, Scala, Python, Spring Boot

Databases: MySQL, PostgreSQL, Redis
"""
    profile = _regex_parse(text)
    assert profile.skills.technical == [
        "Java",
        "Scala",
        "Python",
        "Spring Boot",
        "MySQL",
        "PostgreSQL",
        "Redis",
    ]


def test_regex_parse_computes_total_years_exp_from_experience_span() -> None:
    text = """Jane Doe

EXPERIENCE

Senior Engineer — Acme Corp
2019 - 2021

Engineer — Globex Inc
2015 - 2019
"""
    profile = _regex_parse(text)
    assert profile.meta.totalYearsExp == 6  # 2021 - 2015


def test_regex_parse_leaves_experience_empty_without_a_recognized_section() -> None:
    profile = _regex_parse("Jane Doe\nStaff Engineer")
    assert profile.experience == []
    assert profile.education == []
