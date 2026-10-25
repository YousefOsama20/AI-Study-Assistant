from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class PushRequest(BaseModel):
    do_reset: Optional[int] = 0

class SearchRequest(BaseModel):
    text: str
    limit: Optional[int] = 5
    similarity_threshold: Optional[float] = None

class AnswerRequest(BaseModel):
    text: str
    limit: Optional[int] = None
    chat_history: Optional[List[dict]] = None
    language: Optional[str] = None

class SummaryRequest(BaseModel):
    language: Optional[str] = None
    force_refresh: Optional[bool] = False

class SummaryDocument(BaseModel):
    document_id: int
    filename: str
    page_count: Optional[int] = None
    chunk_count: int
    first_page: Optional[int] = None
    last_page: Optional[int] = None

class ProjectSummaryResponse(BaseModel):
    signal: str
    summary: str
    documents: List[SummaryDocument]
    chunk_count: int
    cached: bool
    truncated: bool
    language: str
    generated_at: str

class SearchResult(BaseModel):
    text: str
    score: float
    asset_id: int
    asset_name: str
    asset_uuid: str
    page_number: Optional[int]
    chunk_index: int
    chunk_id: int

class SourceCitation(BaseModel):
    asset_id: int
    asset_name: str
    asset_uuid: str
    page_number: Optional[int]
    chunk_text: str
    score: float
    chunk_index: int
    chunk_id: int

class ChatMessage(BaseModel):
    role: str
    content: str

class SearchResponse(BaseModel):
    signal: str
    results: List[SearchResult]

class AnswerResponse(BaseModel):
    signal: str
    answer: str
    sources: List[SourceCitation]
    chat_history: List[ChatMessage]