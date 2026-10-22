from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models.enums.ProcessingStatus import ProcessingStatus

class DocumentResponse(BaseModel):
    document_id: int
    document_uuid: str
    original_filename: str
    stored_filename: str
    file_size: int
    page_count: Optional[int]
    status: ProcessingStatus
    error_message: Optional[str]
    preview_image_count: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int