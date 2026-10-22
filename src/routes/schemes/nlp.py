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
    limit: Optional[int] = 5
    chat_history: Optional[List[dict]] = None

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