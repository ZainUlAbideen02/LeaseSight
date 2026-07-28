from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class EntityStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DISCARDED = "DISCARDED"

class MigrationEntity(BaseModel):
    id: Optional[int] = None
    file_name: str
    category: str
    value: str
    confidence: float
    status: EntityStatus = EntityStatus.PENDING

class MigrationTask(BaseModel):
    task_id: str
    status: str
    total_files: int
    processed_files: int
    findings: List[MigrationEntity] = []

class ResearchAuditRequest(BaseModel):
    file_name: str

class Coordinate(BaseModel):
    page: int
    x: float
    y: float
    width: float
    height: float

class ResearchFinding(BaseModel):
    label: str
    value: str
    explanation: str
    coordinates: Optional[Coordinate] = None

class ResearchScorecard(BaseModel):
    originality: ResearchFinding
    technical_rigor: ResearchFinding
    citation_validity: ResearchFinding
    narrative_clarity: ResearchFinding
    overall_score: int
    missing_citations: List[str]

class Finding(BaseModel):
    label: str
    value: str
    evidence_quote: str
    verified_grounded: Optional[bool] = True

class Obligation(BaseModel):
    label: str
    date: str
    description: str
    evidence_quote: Optional[str] = "Not Found"
    verified_grounded: Optional[bool] = True

class Annotation(BaseModel):
    page: int = Field(alias="page")
    x: float
    y: float
    width: float
    height: float
    color: str = "#3b82f6"

class AuditResult(BaseModel):
    findings: List[Finding]
    obligations: Optional[List[Obligation]] = []
    summary_paragraph: str
    risk_score: int
    warnings: List[str]
    annotations: List[Annotation] = []

class AuditRequest(BaseModel):
    file_name: str

class AuthKeys(BaseModel):
    openai_key: Optional[str] = None
    pinecone_key: Optional[str] = None
    azure_key: Optional[str] = None
    azure_endpoint: Optional[str] = None
