"""Pydantic models mirroring the extension's UserProfile (extension/src/shared/profile.ts).

Kept in sync deliberately: the backend is the optional sync/RAG layer for the
same profile shape the extension stores locally.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class Location(BaseModel):
    city: str = ""
    state: str = ""
    country: str = ""
    postalCode: str = ""


class PersonalInfo(BaseModel):
    firstName: str = ""
    lastName: str = ""
    email: str = ""
    phone: str = ""
    location: Location = Field(default_factory=Location)


class Links(BaseModel):
    linkedin: str = ""
    github: str = ""
    portfolio: str = ""
    website: str = ""


class WorkAuth(BaseModel):
    usAuthorized: bool = False
    sponsorshipNeeded: bool = False
    visaType: str = ""


class Experience(BaseModel):
    company: str = ""
    title: str = ""
    startDate: str = ""
    endDate: str = ""
    current: bool = False
    bullets: list[str] = Field(default_factory=list)


class Education(BaseModel):
    school: str = ""
    degree: str = ""
    major: str = ""
    gpa: float | None = None
    year: str = ""


class Skills(BaseModel):
    technical: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)


class Preferences(BaseModel):
    salaryExpected: str = ""
    noticePeriod: str = ""
    remotePreference: str = ""
    willingToRelocate: bool = False


class ProfileMeta(BaseModel):
    totalYearsExp: int = 0


class UserProfile(BaseModel):
    personal: PersonalInfo = Field(default_factory=PersonalInfo)
    links: Links = Field(default_factory=Links)
    workAuth: WorkAuth = Field(default_factory=WorkAuth)
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    skills: Skills = Field(default_factory=Skills)
    preferences: Preferences = Field(default_factory=Preferences)
    meta: ProfileMeta = Field(default_factory=ProfileMeta)
