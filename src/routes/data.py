from fastapi import APIRouter, Depends, UploadFile, File, status, Request, Form
from fastapi.responses import JSONResponse
import os
import hashlib
from helpers.config import get_settings, Settings
import logging
from controllers import DataController, projectController, ProcessController
import aiofiles
from models import ResponseSignal, ProcessingEnum, ProcessingStatus
from .schemes.data import ProcessRequest
from models.ProjectModels import ProjectModel 
from models.ChunkModel import ChunkModel
from models.AssetModel import AssetModel
from models.db_schemes import DataChunk, Asset  
from models.enums.AssetTypeEnum import AssetTypeEnum
from controllers import NLPController

logger = logging.getLogger('uvicorn.error')

data_router = APIRouter(
    prefix="/api/v1/data",
    tags=["api_v1", "data"],
)

def compute_file_hash(file_path: str) -> str:
    """Compute SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def validate_pdf_content(file_path: str) -> tuple[bool, int]:
    """Validate PDF file and return (is_valid, page_count)."""
    try:
        import pymupdf as fitz  # PyMuPDF
        doc = fitz.open(file_path)
        page_count = doc.page_count
        doc.close()
        return True, page_count
    except Exception as e:
        logger.error(f"PDF validation failed: {e}")
        return False, 0

@data_router.post("/upload/{project_id}")
async def upload_data(request: Request, project_id: int, files: list[UploadFile] = File(...),
                      app_settings: Settings = Depends(get_settings)):
    
    project_model = await ProjectModel.create_instance(
        db_client=request.app.db_client
    )

    project = await project_model.get_project_or_create_one(
        project_id=project_id
    )

    data_controller = DataController()
    asset_model = await AssetModel.create_instance(
        db_client=request.app.db_client
    )

    uploaded_files = []
    
    for file in files:
        is_valid, result_signal = data_controller.validate_uploaded_file(file=file)

        if not is_valid:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "signal": result_signal,
                    "filename": file.filename
                }
            )
        
        project_dir_path = projectController().get_project_path(project_id=project_id)
        
        file_path, file_id = data_controller.generate_unique_filepath(
            orig_file_name=file.filename,
            project_id=project_id
        )

        try:
            async with aiofiles.open(file_path, 'wb') as f:
                while chunk := await file.read(app_settings.FILE_DEFAULT_CHUNK_SIZE):
                    await f.write(chunk)
        except Exception as e:
            logger.error(f"Error occurred while saving the file: {e}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "signal": ResponseSignal.FILE_UPLOAD_FAILED.value,
                    "filename": file.filename
                }
            )
        
        # Validate PDF content and get page count
        is_valid_pdf, page_count = validate_pdf_content(file_path)
        if not is_valid_pdf:
            os.remove(file_path)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "signal": ResponseSignal.FILE_TYPE_NOT_SUPPORTED.value,
                    "filename": file.filename
                }
            )
        
        # Compute file hash for deduplication
        file_hash = compute_file_hash(file_path)
        
        # Check for duplicate in project
        existing_asset = await asset_model.get_asset_record(
            asset_project_id=project_id,
            asset_name=file_hash  # We'll store hash as a separate field, but check by hash in config
        )
        # Actually check by content_hash in assets
        async with request.app.db_client() as session:
            from sqlalchemy import select
            stmt = select(Asset).where(
                Asset.asset_project_id == project_id,
                Asset.content_hash == file_hash
            )
            result = await session.execute(stmt)
            duplicate = result.scalar_one_or_none()
            if duplicate:
                os.remove(file_path)
                uploaded_files.append({
                    "filename": file.filename,
                    "file_id": duplicate.asset_name,
                    "document_id": duplicate.asset_id,
                    "duplicate": True
                })
                continue
        
        asset = Asset(
            asset_project_id=project_id,
            asset_type=AssetTypeEnum.FILE.value,
            asset_name=file_id,
            asset_size=os.path.getsize(file_path),
            asset_config={
                "file_path": file_path,
                "file_id": file_id
            },
            original_filename=file.filename,
            status=ProcessingStatus.UPLOADED.value,
            page_count=page_count,
            content_hash=file_hash,
            preview_image_count=0
        )

        await asset_model.create_asset(asset=asset)
        
        uploaded_files.append({
            "filename": file.filename,
            "file_id": file_id,
            "document_id": asset.asset_id,
            "duplicate": False,
            "page_count": page_count
        })

    return JSONResponse(
        content={
            "signal": ResponseSignal.FILE_UPLOAD_SUCCESS.value,
            "files": uploaded_files
        }
    )


@data_router.post("/process/{project_id}")

async def process_endpoint(request: Request, project_id: int, process_request: ProcessRequest):

    chunk_size = process_request.chunk_size
    overlap_size = process_request.overlap_size
    do_reset = process_request.do_reset

    project_model = await ProjectModel.create_instance(
        db_client= request.app.db_client
    )
    project = await project_model.get_project_or_create_one(project_id=project_id)    

    nlp_controller = NLPController(
        vectordb_client=request.app.vectordb_client,
        embedding_client=request.app.embedding_client,
        generation_client=request.app.generation_client,
        template_parser = request.app.template_parser,
    )

    asset_model = await AssetModel.create_instance(
        db_client=request.app.db_client
    )

    project_files_ids = {}
    if process_request.file_id:
        asset_record = await asset_model.get_asset_record(
            asset_project_id=project_id,
            asset_name=process_request.file_id
        )
        if asset_record is None:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "signal": ResponseSignal.FILE_ID_ERROR.value,
                }
            )
        
        project_files_ids = {
            asset_record.asset_id: asset_record.asset_name
        }
    else:
        project_files = await asset_model.get_all_project_assets(
            asset_project_id=project_id,
            asset_type=AssetTypeEnum.FILE.value
        )

        project_files_ids = {
            record.asset_id: record.asset_name
            for record in project_files
        }
   
    if len(project_files_ids) == 0:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "signal": ResponseSignal.NO_FILES_ERROR.value
            }
        )
    
    process_controller = ProcessController(project_id=project_id)

    no_records = 0
    no_files = 0
    processed_files = []
    failed_files = []

    chunk_model = await ChunkModel.create_instance(
        db_client=request.app.db_client
    )

    if bool(do_reset):
        collection_name = nlp_controller.create_collection_name(project_id=project.project_id)

        _ = await request.app.vectordb_client.delete_collection(collection_name=collection_name)

        _ = await chunk_model.delete_chunks_by_project_id(project_id=project.project_id)

    for asset_id, file_id in project_files_ids.items():
        # Update status to extracting
        await asset_model.update_asset_status(asset_id, ProcessingStatus.EXTRACTING.value)
        
        file_content = process_controller.get_file_content(file_id=file_id)

        if file_content is None:
            logger.error(f"Error loading the file {file_id} for the project {project_id}")
            await asset_model.update_asset_status(
                asset_id, ProcessingStatus.FAILED.value, 
                error_message="Failed to load file content"
            )
            failed_files.append({"file_id": file_id, "error": "Failed to load file content"})
            continue

        # Update status to chunking
        await asset_model.update_asset_status(asset_id, ProcessingStatus.CHUNKING.value)
        
        file_chunks = process_controller.process_file_content(
            file_content=file_content,
            file_id=file_id,
            chunk_size=chunk_size,
            overlap_size=overlap_size
        )

        if file_chunks is None or len(file_chunks) == 0:
            await asset_model.update_asset_status(
                asset_id, ProcessingStatus.FAILED.value,
                error_message="File processing produced no chunks"
            )
            failed_files.append({"file_id": file_id, "error": "File processing produced no chunks"})
            continue

        # Update status to embedding
        await asset_model.update_asset_status(asset_id, ProcessingStatus.EMBEDDING.value)

        # Clear this asset's previous vectors and chunks so repeated
        # processing/reprocessing never duplicates data.
        existing_chunk_ids = await chunk_model.get_chunk_ids_by_asset_id(asset_id=asset_id)
        if existing_chunk_ids:
            await nlp_controller.delete_chunks_vectors(project=project, chunk_ids=existing_chunk_ids)
            await chunk_model.delete_chunks_by_asset_id(asset_id=asset_id)
        
        file_chunk_records = [
            DataChunk(
                chunk_text=chunk.page_content,
                chunk_metadata=chunk.metadata,
                chunk_order=i+1,
                chunk_project_id=project_id,
                chunk_asset_id=asset_id,
                page_number=chunk.metadata.get("page", None),
                chunk_index=i
            )
            for i, chunk in enumerate(file_chunks)
        ]

        inserted = await chunk_model.insert_many_chunks(chunks=file_chunk_records)
        no_records += inserted
        no_files += 1
        
        # Generate preview images
        try:
            await asset_model.update_asset_status(asset_id, ProcessingStatus.INDEXING.value)
            preview_count = process_controller.generate_preview_images(file_id=file_id)
            # Keep the real PDF page count; only record how many previews exist.
            await asset_model.update_asset_status(asset_id, ProcessingStatus.READY.value,
                                                  preview_image_count=preview_count)
        except Exception as e:
            logger.warning(f"Preview generation failed for {file_id}: {e}")
            await asset_model.update_asset_status(asset_id, ProcessingStatus.READY.value)
        
        processed_files.append({
            "file_id": file_id,
            "asset_id": asset_id,
            "chunks": inserted
        })

    return JSONResponse(
        content={
            "signal": ResponseSignal.PROCESSING_SUCCESS.value,
            "inserted_chunks": no_records,
            "processed_files": no_files,
            "files": processed_files,
            "failed_files": failed_files
        }
    )