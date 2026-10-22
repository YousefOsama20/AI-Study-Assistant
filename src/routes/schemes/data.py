from pydantic import BaseModel
from typing import Optional, Union

class ProcessRequest(BaseModel):
    file_id: Optional[str] = None
    chunk_size: Optional[int] = 100
    overlap_size: Optional[int] = 20
    do_reset: Optional[Union[bool, int]] = False

