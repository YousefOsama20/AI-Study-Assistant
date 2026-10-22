from enum import Enum
from dataclasses import dataclass

class ProcessingEnum(Enum):

    TXT = ".txt"
    PDF = ".pdf"

@dataclass
class Document:
    page_content: str
    metadata: dict