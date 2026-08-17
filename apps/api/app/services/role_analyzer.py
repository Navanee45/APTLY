"""
APTLY API — Role Analyzer Service

Parses raw Job Descriptions into structured RoleProfile objects.
Uses LLMProvider with fallback extraction logic for deterministic mock environments.
"""

from __future__ import annotations

import re
from typing import Any

from app.core.logging import get_logger
from app.models.job import Job, RoleProfile
from app.services.providers.base import LLMProvider, LLMStructuredRequest

logger = get_logger(__name__)

PROMPT_VERSION = "role_analysis/v1"
SCHEMA_VERSION = "1.0"


class RoleAnalyzerService:
    """
    Service for analyzing job postings into structured role profiles.
    """

    def __init__(self, llm_provider: LLMProvider) -> None:
        self.llm_provider = llm_provider

    async def analyze(
        self,
        job_description: str,
        title_override: str | None = None,
        company: str | None = None,
    ) -> tuple[Job, RoleProfile]:
        """
        Analyze the job description, create Job and RoleProfile entities.
        """
        logger.info("job_analysis_started", jd_length=len(job_description))

        # 1. Request structured extraction from LLM
        schema = {
            "role_title": "string",
            "seniority": "string (Entry-Level | Mid-Level | Senior | Staff | Lead | Principal)",
            "domain": "string (e.g. Backend Engineering, Full-Stack, Machine Learning, Product)",
            "technical_skills": ["string"],
            "tools": ["string"],
            "responsibilities": ["string"],
            "behavioral_competencies": ["string"],
            "interview_topics": ["string"],
            "preferred_experience": ["string"],
        }

        system_prompt = (
            "You are a principal technical recruiter and interview architect. "
            "Extract structured competency and interview requirement data from the given Job Description. "
            "Only extract skills and responsibilities explicitly mentioned or strongly implied."
        )

        user_prompt = (
            f"Analyze this job description:\n\n{job_description}\n\n"
            "Return valid JSON matching the schema."
        )

        raw_result: dict[str, Any] = {}
        try:
            raw_result = await self.llm_provider.generate_structured(
                LLMStructuredRequest(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    output_schema=schema,
                )
            )
        except Exception as err:
            logger.warning("role_analysis_llm_failed_using_heuristics", error=str(err)[:200])
            raw_result = {}

        # 2. Extract or parse structured fields (with intelligent fallback if mock)
        parsed = self._normalize_extracted_data(
            raw_result, job_description, title_override
        )

        # 3. Create Job and RoleProfile ORM instances
        job = Job(
            raw_text=job_description,
            title=title_override or parsed["role_title"],
            company=company,
        )

        role_profile = RoleProfile(
            job=job,
            role_title=title_override or parsed["role_title"],
            seniority=parsed["seniority"],
            domain=parsed["domain"],
            technical_skills=parsed["technical_skills"],
            tools=parsed["tools"],
            responsibilities=parsed["responsibilities"],
            behavioral_competencies=parsed["behavioral_competencies"],
            interview_topics=parsed["interview_topics"],
            preferred_experience=parsed["preferred_experience"],
            prompt_version=PROMPT_VERSION,
            schema_version=SCHEMA_VERSION,
        )

        logger.info(
            "job_analysis_completed",
            role_title=role_profile.role_title,
            seniority=role_profile.seniority,
            skill_count=len(role_profile.technical_skills),
        )

        return job, role_profile

    def _normalize_extracted_data(
        self,
        raw_result: dict[str, Any],
        raw_text: str,
        title_override: str | None = None,
    ) -> dict[str, Any]:
        """
        Validates and populates default/heuristic values if LLM output is partial or in mock mode.
        """
        # If real LLM returned valid keys
        if "role_title" in raw_result and not raw_result.get("_mock"):
            return {
                "role_title": str(
                    raw_result.get("role_title") or "Software Engineer"
                ).strip(),
                "seniority": str(raw_result.get("seniority") or "Mid-Level").strip(),
                "domain": str(
                    raw_result.get("domain") or "Software Engineering"
                ).strip(),
                "technical_skills": [
                    str(s).strip() for s in raw_result.get("technical_skills", []) if s
                ],
                "tools": [str(t).strip() for t in raw_result.get("tools", []) if t],
                "responsibilities": [
                    str(r).strip() for r in raw_result.get("responsibilities", []) if r
                ],
                "behavioral_competencies": [
                    str(c).strip()
                    for c in raw_result.get("behavioral_competencies", [])
                    if c
                ],
                "interview_topics": [
                    str(i).strip() for i in raw_result.get("interview_topics", []) if i
                ],
                "preferred_experience": [
                    str(e).strip()
                    for e in raw_result.get("preferred_experience", [])
                    if e
                ],
            }

        # Deterministic extraction heuristics for Mock / Fallback mode
        text_lower = raw_text.lower()

        # Seniority detection
        seniority = "Mid-Level"
        if any(
            w in text_lower for w in ["junior", "entry", "associate", "intern", "0-2"]
        ):
            seniority = "Junior / Entry-Level"
        elif any(
            w in text_lower for w in ["principal", "staff", "architect", "lead", "head"]
        ):
            seniority = "Staff / Principal"
        elif any(w in text_lower for w in ["senior", "sr.", "sr ", "5+", "7+"]):
            seniority = "Senior"

        # Role title detection
        role_title = title_override or "Full-Stack Software Engineer"
        first_line = raw_text.strip().split("\n")[0]
        if len(first_line) < 60 and (
            "engineer" in first_line.lower()
            or "developer" in first_line.lower()
            or "manager" in first_line.lower()
        ):
            role_title = first_line.strip()
        elif "backend" in text_lower:
            role_title = f"{seniority} Backend Engineer"
        elif "frontend" in text_lower:
            role_title = f"{seniority} Frontend Engineer"
        elif "machine learning" in text_lower or "ai" in text_lower:
            role_title = f"{seniority} Machine Learning Engineer"

        # Technical skills detection
        skill_catalog = [
            "Python",
            "FastAPI",
            "Django",
            "TypeScript",
            "JavaScript",
            "React",
            "Next.js",
            "Node.js",
            "PostgreSQL",
            "MySQL",
            "Redis",
            "Docker",
            "Kubernetes",
            "AWS",
            "GCP",
            "GraphQL",
            "REST APIs",
            "SQLAlchemy",
            "PyTorch",
            "TailwindCSS",
            "Git",
            "CI/CD",
        ]
        detected_skills = [
            s
            for s in skill_catalog
            if re.search(rf"\b{re.escape(s.lower())}\b", text_lower)
        ]
        if not detected_skills:
            detected_skills = ["Python", "FastAPI", "PostgreSQL", "Docker", "REST APIs"]

        tools = [
            t
            for t in [
                "Git",
                "Docker",
                "GitHub Actions",
                "Redis",
                "Postman",
                "Linux",
                "VS Code",
            ]
            if t.lower() in text_lower
        ] or ["Git", "Docker", "Redis"]

        responsibilities = [
            "Design and build scalable, maintainable backend APIs and database schemas",
            "Collaborate with cross-functional teams to deliver production features",
            "Participate in code reviews, automated testing, and technical documentation",
        ]

        behavioral_competencies = [
            "System Architecture & Problem Solving",
            "Ownership and Accountability",
            "Clear Technical Communication",
            "Collaboration in Agile Sprints",
        ]

        interview_topics = [
            f"{detected_skills[0]} Architecture & Best Practices"
            if detected_skills
            else "System Design",
            "Database Schema Optimization & Query Performance",
            "API Design & Concurrency Handling",
            "Past Technical Challenges & Production Trade-offs (STAR)",
        ]

        preferred_experience = [
            "3+ years building high-throughput web applications",
            "Demonstrated experience with relational databases and caching architectures",
        ]

        return {
            "role_title": role_title,
            "seniority": seniority,
            "domain": "Software Engineering",
            "technical_skills": detected_skills[:8],
            "tools": tools[:5],
            "responsibilities": responsibilities,
            "behavioral_competencies": behavioral_competencies,
            "interview_topics": interview_topics,
            "preferred_experience": preferred_experience,
        }
