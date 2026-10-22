from typing import Optional

from fastapi import APIRouter, Depends, status, Request, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from helpers.config import get_settings, Settings
from models import ResponseSignal, ProcessingStatus
from models.ProjectModels import ProjectModel
from models.AssetModel import AssetModel
from models.ChunkModel import ChunkModel
from models.db_schemes import Project, Asset
from routes.schemes.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse

import logging

logger = logging.getLogger('uvicorn.error')

project_router = APIRouter(
    prefix="/api/v1/projects",
    tags=["api_v1", "projects"],
)

@project_router.get("", response_model=ProjectListResponse)
async def list_projects(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    app_settings: Settings = Depends(get_settings)
):
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    
    async with request.app.db_client() as session:
        query = select(Project).options(selectinload(Project.assets))
        
        if search:
            query = query.where(Project.name.ilike(f"%{search}%"))
        
        # Get total count
        count_query = select(func.count(Project.project_id))
        if search:
            count_query = count_query.where(Project.name.ilike(f"%{search}%"))
        total = await session.scalar(count_query)
        
        # Apply pagination
        query = query.offset((page - 1) * page_size).limit(page_size).order_by(Project.updated_at.desc().nullslast(), Project.created_at.desc())
        result = await session.execute(query)
        projects = result.scalars().all()
        
        project_responses = []
        for project in projects:
            doc_count = len(project.assets) if project.assets else 0
            project_responses.append(ProjectResponse(
                project_id=project.project_id,
                project_uuid=str(project.project_uuid),
                name=project.name,
                description=project.description,
                document_count=doc_count,
                created_at=project.created_at,
                updated_at=project.updated_at
            ))
        
        total_pages = (total + page_size - 1) // page_size if total > 0 else 1
        
        return ProjectListResponse(
            projects=project_responses,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )

@project_router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    request: Request,
    project_data: ProjectCreate,
    app_settings: Settings = Depends(get_settings)
):
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    
    # Check for duplicate name
    async with request.app.db_client() as session:
        existing = await session.execute(
            select(Project).where(Project.name == project_data.name)
        )
        if existing.scalar_one_or_none():
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"signal": ResponseSignal.DUPLICATE_FILE.value}
            )
    
    new_project = Project(
        name=project_data.name,
        description=project_data.description
    )
    
    created_project = await project_model.create_project(project=new_project)
    
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "signal": ResponseSignal.PROJECT_CREATED.value,
            "project": {
                "project_id": created_project.project_id,
                "project_uuid": str(created_project.project_uuid),
                "name": created_project.name,
                "description": created_project.description,
                "document_count": 0,
                "created_at": created_project.created_at.isoformat() if created_project.created_at else None,
                "updated_at": created_project.updated_at.isoformat() if created_project.updated_at else None
            }
        }
    )

@project_router.get("/{project_id}")
async def get_project(
    request: Request,
    project_id: int,
    app_settings: Settings = Depends(get_settings)
):
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    
    async with request.app.db_client() as session:
        query = select(Project).options(selectinload(Project.assets)).where(Project.project_id == project_id)
        result = await session.execute(query)
        project = result.scalar_one_or_none()
        
        if not project:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"signal": ResponseSignal.PROJECT_NOT_FOUND.value}
            )
        
        doc_count = len(project.assets) if project.assets else 0
        
        return JSONResponse(
            content={
                "signal": ResponseSignal.PROJECT_LIST_RETRIEVED.value,
                "project": {
                    "project_id": project.project_id,
                    "project_uuid": str(project.project_uuid),
                    "name": project.name,
                    "description": project.description,
                    "document_count": doc_count,
                    "created_at": project.created_at.isoformat() if project.created_at else None,
                    "updated_at": project.updated_at.isoformat() if project.updated_at else None
                }
            }
        )

@project_router.patch("/{project_id}")
async def update_project(
    request: Request,
    project_id: int,
    project_data: ProjectUpdate,
    app_settings: Settings = Depends(get_settings)
):
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    
    async with request.app.db_client() as session:
        async with session.begin():
            query = select(Project).where(Project.project_id == project_id)
            result = await session.execute(query)
            project = result.scalar_one_or_none()
            
            if not project:
                return JSONResponse(
                    status_code=status.HTTP_404_NOT_FOUND,
                    content={"signal": ResponseSignal.PROJECT_NOT_FOUND.value}
                )
            
            # Check for duplicate name if name is being changed
            if project_data.name and project_data.name != project.name:
                existing = await session.execute(
                    select(Project).where(Project.name == project_data.name)
                )
                if existing.scalar_one_or_none():
                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={"signal": ResponseSignal.DUPLICATE_FILE.value}
                    )
                project.name = project_data.name
            
            if project_data.description is not None:
                project.description = project_data.description
            
            await session.flush()
        
        # Refresh after transaction is committed
        await session.refresh(project)
        
        return JSONResponse(
            content={
                "signal": ResponseSignal.PROJECT_UPDATED.value,
                "project": {
                    "project_id": project.project_id,
                    "project_uuid": str(project.project_uuid),
                    "name": project.name,
                    "description": project.description,
                    "created_at": project.created_at.isoformat() if project.created_at else None,
                    "updated_at": project.updated_at.isoformat() if project.updated_at else None
                }
            }
        )

@project_router.delete("/{project_id}")
async def delete_project(
    request: Request,
    project_id: int,
    app_settings: Settings = Depends(get_settings)
):
    project_model = await ProjectModel.create_instance(db_client=request.app.db_client)
    asset_model = await AssetModel.create_instance(db_client=request.app.db_client)
    chunk_model = await ChunkModel.create_instance(db_client=request.app.db_client)
    
    # Get project with assets first (outside transaction)
    async with request.app.db_client() as session:
        query = select(Project).options(selectinload(Project.assets)).where(Project.project_id == project_id)
        result = await session.execute(query)
        project = result.scalar_one_or_none()
        
        if not project:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"signal": ResponseSignal.PROJECT_NOT_FOUND.value}
            )
        
        asset_ids = [asset.asset_id for asset in project.assets]
        project_uuid = project.project_uuid

    # Delete in FK-safe order:
    # 1. Drop the vector collection first (pgvector rows reference chunks.chunk_id)
    from controllers.NLPController import NLPController
    nlp_controller = NLPController(
        vectordb_client=request.app.vectordb_client,
        embedding_client=request.app.embedding_client,
        generation_client=request.app.generation_client,
        template_parser=request.app.template_parser,
    )
    collection_name = nlp_controller.create_collection_name(project_id)
    try:
        await request.app.vectordb_client.delete_collection(collection_name=collection_name)
    except Exception as e:
        logger.warning(f"Could not drop vector collection {collection_name}: {e}")

    # 2. Delete chunks for the whole project
    await chunk_model.delete_chunks_by_project_id(project_id=project_id)

    # 3. Delete assets
    for asset_id in asset_ids:
        await asset_model.delete_asset(asset_id)
    
    # 4. Delete project row
    async with request.app.db_client() as session:
        async with session.begin():
            query = select(Project).where(Project.project_id == project_id)
            result = await session.execute(query)
            project = result.scalar_one_or_none()
            if project:
                await session.delete(project)
                await session.flush()

    # 5. Delete associated files from filesystem
    from controllers.projectController import projectController
    import os
    import shutil
    
    project_path = projectController().get_project_path(project_id=str(project_id))
    if os.path.exists(project_path):
        shutil.rmtree(project_path, ignore_errors=True)
    
    return JSONResponse(
        content={"signal": ResponseSignal.PROJECT_DELETED.value}
    )