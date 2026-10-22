from .BassController import BassController
from .projectController import projectController
import os
from langchain_community.document_loaders import TextLoader
from langchain_community.document_loaders import PyMuPDFLoader
from models import ProcessingEnum
from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import List
from dataclasses import dataclass
import pymupdf as fitz  # PyMuPDF
from models.enums import Document
     
class ProcessController(BassController):

    def __init__(self, project_id: str):
        super().__init__()
        self.project_id = project_id
        self.project_path = projectController().get_project_path(project_id)

    def get_file_extension(self, file_id: str):
        return os.path.splitext(file_id)[-1]

    def get_file_loader(self, file_id: str):
        file_extension = self.get_file_extension(file_id=file_id)
        file_path = os.path.join(self.project_path, file_id)

        if not os.path.exists(file_path):
            return None

        if file_extension == ProcessingEnum.TXT.value:
            return TextLoader(file_path, encoding="utf-8")

        if file_extension == ProcessingEnum.PDF.value:
            return PyMuPDFLoader(file_path)

        return None

    def get_file_content(self, file_id: str):
        loader = self.get_file_loader(file_id=file_id)
        if loader:
            return loader.load()
        return None

    def process_file_content(self, file_content: list, file_id: str,
                            chunk_size: int=1000, overlap_size: int=200):
        """
        Process file content using RecursiveCharacterTextSplitter while preserving page metadata.
        """
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=overlap_size,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

        # PyMuPDFLoader returns one Document per page with page metadata
        # We need to split each page's content while preserving page number
        all_chunks = []
        
        for page_doc in file_content:
            # PyMuPDF uses 0-based page metadata; store 1-based page numbers to
            # match preview endpoints and user-facing citations.
            page_number = page_doc.metadata.get("page", 0) + 1
            page_text = page_doc.page_content
            
            if not page_text.strip():
                continue
            
            # Split the page text into chunks
            page_chunks = text_splitter.split_text(page_text)
            
            for chunk_idx, chunk_text in enumerate(page_chunks):
                if chunk_text.strip():
                    all_chunks.append(Document(
                        page_content=chunk_text.strip(),
                        metadata={
                            "page": page_number,
                            "chunk_index": chunk_idx,
                            "source": file_id
                        }
                    ))
        
        return all_chunks

    def generate_preview_images(self, file_id: str, dpi: int = None, max_pages: int = None) -> int:
        """
        Generate preview images for each page of the PDF.
        Returns the number of preview images generated.
        """
        if dpi is None:
            dpi = self.app_setting.PREVIEW_DPI 
        if max_pages is None:
            max_pages = self.app_setting.MAX_PREVIEW_PAGES

        file_path = os.path.join(self.project_path, file_id)
        
        if not os.path.exists(file_path):
            return 0
        
        file_extension = self.get_file_extension(file_id)
        if file_extension != ProcessingEnum.PDF.value:
            return 0
        
        # Create previews directory
        preview_dir = os.path.join(self.project_path, "previews")
        os.makedirs(preview_dir, exist_ok=True)
        
        try:
            doc = fitz.open(file_path)
            page_count = min(doc.page_count, max_pages)
            
            for page_num in range(page_count):
                page = doc[page_num]
                # Render page to pixmap
                mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
                pix = page.get_pixmap(matrix=mat)
                
                # Save as PNG
                preview_filename = f"{file_id}_page_{page_num + 1}.png"
                preview_path = os.path.join(preview_dir, preview_filename)
                pix.save(preview_path)
            
            doc.close()
            return page_count
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Preview generation failed for {file_id}: {e}")
            return 0