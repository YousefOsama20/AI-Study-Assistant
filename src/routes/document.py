from fastapi import APIRouter, Depends, status, Request, Query, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import os
import hashlib
import aiofiles

from helpers.config import get_settings, Settings
from models import ResponseSignal, ProcessingStatus, AssetTypeEnum
from models.ProjectModels import ProjectModel
from models.AssetModel import AssetModel
from models.ChunkModel import ChunkModel
from models.db_schemes import Project, Asset, DataChunk
from routes.schemes.document import DocumentResponse, DocumentListResponse
from controllers import DataController, ProcessController, NLPController
from controllers.projectController import projectController

import logging

logger = logging.getLogger('uvicorn.error')

document_router = APIRouter(
    prefix="/api/v1/projects",
    tags=["api_v1", "documents"],
)

@document_router.get("/{project_id}/documents", response_model=DocumentListResponse)
async def list_documents(
    request: Request,
    project_id: int,
    app_settings: Settings = Depends(get_settings)
):
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    project = await project_model.get_project_or_create_one(project_id=project_id)
    
    if not project:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": ResponseSignal.PROJECT_NOT_FOUND.value}
        )
    
    asset_model = await AssetModel.create_instance(db_client=request.app.db_client)
    assets = await asset_model.get_all_project_assets(asset_project_id=project_id, asset_type=AssetTypeEnum.FILE.value)
    
    documents = []
    for asset in assets:
        documents.append(DocumentResponse(
            document_id=asset.asset_id,
            document_uuid=str(asset.asset_uuid),
            original_filename=asset.original_filename,
            stored_filename=asset.asset_name,
            file_size=asset.asset_size,
            page_count=asset.page_count,
            status=ProcessingStatus(asset.status),
            error_message=asset.error_message,
            preview_image_count=asset.preview_image_count,
            created_at=asset.created_at,
            updated_at=asset.updated_at
        ))
    
    return DocumentListResponse(documents=documents, total=len(documents))

@document_router.get("/{project_id}/documents/{document_id}")
async def get_document(
    request: Request,
    project_id: int,
    document_id: int,
    app_settings: Settings = Depends(get_settings)
):
    asset_model = await AssetModel.create_instance(db_client=request.app.db_client)
    asset = await asset_model.get_asset_by_id(asset_id=document_id)
    
    if not asset or asset.asset_project_id != project_id:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": ResponseSignal.FILE_ID_ERROR.value}
        )
    
    return JSONResponse(
        content={
            "signal": ResponseSignal.DOCUMENT_LIST_RETRIEVED.value,
            "document": DocumentResponse(
                document_id=asset.asset_id,
                document_uuid=str(asset.asset_uuid),
                original_filename=asset.original_filename,
                stored_filename=asset.asset_name,
                file_size=asset.asset_size,
                page_count=asset.page_count,
                status=ProcessingStatus(asset.status),
                error_message=asset.error_message,
                preview_image_count=asset.preview_image_count,
                created_at=asset.created_at,
                updated_at=asset.updated_at
            ).model_dump()
        }
    )

@document_router.delete("/{project_id}/documents/{document_id}")
async def delete_document(
    request: Request,
    project_id: int,
    document_id: int,
    app_settings: Settings = Depends(get_settings)
):
    asset_model = await AssetModel.create_instance(db_client=request.app.db_client)
    chunk_model = await ChunkModel.create_instance(db_client=request.app.db_client)
    asset = await asset_model.get_asset_by_id(asset_id=document_id)
    
    if not asset or asset.asset_project_id != project_id:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": ResponseSignal.FILE_ID_ERROR.value}
        )
    
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    project = await project_model.get_project_or_create_one(project_id=project_id)

    nlp_controller = NLPController(
        vectordb_client=request.app.vectordb_client,
        embedding_client=request.app.embedding_client,
        generation_client=request.app.generation_client,
        template_parser=request.app.template_parser,
    )

    # 1. Delete vectors for this document's chunks first
    #    (pgvector rows hold an FK to chunks.chunk_id)
    chunk_ids = await chunk_model.get_chunk_ids_by_asset_id(asset_id=document_id)
    await nlp_controller.delete_chunks_vectors(project=project, chunk_ids=chunk_ids)

    # 2. Delete this document's chunks (by asset, not project)
    await chunk_model.delete_chunks_by_asset_id(asset_id=document_id)

    # 3. Delete only this document's preview images
    file_path = asset.asset_config.get("file_path") if asset.asset_config else None
    if file_path:
        preview_dir = os.path.join(os.path.dirname(file_path), "previews")
        if os.path.isdir(preview_dir):
            prefix = f"{asset.asset_name}_page_"
            for name in os.listdir(preview_dir):
                if name.startswith(prefix) and name.endswith(".png"):
                    try:
                        os.remove(os.path.join(preview_dir, name))
                    except OSError:
                        logger.warning(f"Could not remove preview file {name}")

    # 4. Delete the original file from disk
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
    
    # 5. Delete asset row
    await asset_model.delete_asset(document_id)
    
    return JSONResponse(content={"signal": ResponseSignal.DOCUMENT_DELETED.value})

@document_router.post("/{project_id}/documents/{document_id}/reprocess")
async def reprocess_document(
    request: Request,
    project_id: int,
    document_id: int,
    app_settings: Settings = Depends(get_settings)
):
    asset_model = await AssetModel.create_instance(db_client=request.app.db_client)
    chunk_model = await ChunkModel.create_instance(db_client=request.app.db_client)
    asset = await asset_model.get_asset_by_id(asset_id=document_id)
    
    if not asset or asset.asset_project_id != project_id:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": ResponseSignal.FILE_ID_ERROR.value}
        )
    
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    project = await project_model.get_project_or_create_one(project_id=project_id)

    nlp_controller = NLPController(
        vectordb_client=request.app.vectordb_client,
        embedding_client=request.app.embedding_client,
        generation_client=request.app.generation_client,
        template_parser=request.app.template_parser,
    )

    # Clear this document's previous vectors and chunks first so
    # reprocessing is idempotent (no duplicated chunks).
    chunk_ids = await chunk_model.get_chunk_ids_by_asset_id(asset_id=document_id)
    await nlp_controller.delete_chunks_vectors(project=project, chunk_ids=chunk_ids)
    await chunk_model.delete_chunks_by_asset_id(asset_id=document_id)

    # Reset status to uploaded
    await asset_model.update_asset_status(document_id, ProcessingStatus.UPLOADED.value, error_message=None)
    
    # Trigger processing via the existing process endpoint logic
    from routes.data import process_endpoint
    from routes.schemes.data import ProcessRequest
    
    process_request = ProcessRequest(file_id=asset.asset_name, do_reset=False)
    
    # Call the process endpoint logic directly
    return await process_endpoint(request, project_id, process_request)

@document_router.get("/{project_id}/documents/{document_id}/preview/{page_num}")
async def get_preview_image(
    request: Request,
    project_id: int,
    document_id: int,
    page_num: int,
    app_settings: Settings = Depends(get_settings)
):
    from fastapi.responses import FileResponse
    
    asset_model = await AssetModel.create_instance(db_client=request.app.db_client)
    asset = await asset_model.get_asset_by_id(asset_id=document_id)
    
    if not asset or asset.asset_project_id != project_id:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": ResponseSignal.FILE_ID_ERROR.value}
        )
    
    if page_num < 1 or page_num > (asset.preview_image_count or 0):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": "preview_not_found"}
        )
    
    file_path = asset.asset_config.get("file_path") if asset.asset_config else None
    if not file_path:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": "file_not_found"}
        )
    
    preview_dir = os.path.join(os.path.dirname(file_path), "previews")
    preview_path = os.path.join(preview_dir, f"{asset.asset_name}_page_{page_num}.png")
    
    if not os.path.exists(preview_path):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": "preview_not_found"}
        )
    
    return FileResponse(preview_path, media_type="image/png")


@document_router.get("/{project_id}/documents/{document_id}/file")
async def download_document_file(
    request: Request,
    project_id: int,
    document_id: int,
    app_settings: Settings = Depends(get_settings)
):
    """Serve the original PDF after validating it lives inside the storage root."""
    asset_model = await AssetModel.create_instance(db_client=request.app.db_client)
    asset = await asset_model.get_asset_by_id(asset_id=document_id)

    if not asset or asset.asset_project_id != project_id:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": ResponseSignal.FILE_ID_ERROR.value}
        )

    file_path = asset.asset_config.get("file_path") if asset.asset_config else None
    if not file_path:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": "file_not_found"}
        )

    from controllers.BassController import BassController
    storage_root = os.path.realpath(BassController().files_dir)
    resolved_path = os.path.realpath(file_path)

    if resolved_path != storage_root and not resolved_path.startswith(storage_root + os.sep):
        logger.error(f"Rejected download outside storage root for document {document_id}")
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": "file_not_found"}
        )

    if not os.path.isfile(resolved_path) or not resolved_path.lower().endswith(".pdf"):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"signal": "file_not_found"}
        )

    safe_name = asset.original_filename if str(asset.original_filename).lower().endswith(".pdf") else f"{asset.asset_name}.pdf"
    return FileResponse(
        resolved_path,
        media_type="application/pdf",
        filename=safe_name,
    )