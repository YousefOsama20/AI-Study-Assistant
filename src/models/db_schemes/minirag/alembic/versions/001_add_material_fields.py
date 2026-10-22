"""Add project material fields and document processing status

Revision ID: 001_add_material_fields
Revises: a599361d0859
Create Date: 2026-10-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_add_material_fields'
down_revision: Union[str, None] = 'a599361d0859'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns to projects table
    op.add_column('projects', sa.Column('name', sa.String(255), nullable=False, server_default='Untitled Project'))
    op.add_column('projects', sa.Column('description', sa.Text, nullable=True))
    
    # Add columns to assets table
    op.add_column('assets', sa.Column('original_filename', sa.String(512), nullable=False, server_default=''))
    op.add_column('assets', sa.Column('status', sa.String(50), nullable=False, server_default='uploaded'))
    op.add_column('assets', sa.Column('error_message', sa.Text, nullable=True))
    op.add_column('assets', sa.Column('page_count', sa.Integer, nullable=True))
    op.add_column('assets', sa.Column('content_hash', sa.String(64), nullable=True))
    op.add_column('assets', sa.Column('preview_image_count', sa.Integer, nullable=False, server_default='0'))
    
    # Add columns to chunks table
    op.add_column('chunks', sa.Column('page_number', sa.Integer, nullable=True))
    op.add_column('chunks', sa.Column('chunk_index', sa.Integer, nullable=False, server_default='0'))
    
    # Change chunk_text from String to Text
    op.alter_column('chunks', 'chunk_text', type_=sa.Text, existing_type=sa.String, nullable=False)
    
    # Create indexes
    op.create_index('ix_asset_status', 'assets', ['status'])
    op.create_index('ix_asset_content_hash', 'assets', ['content_hash'])
    op.create_index('ix_chunk_page_number', 'chunks', ['page_number'])
    
    # Remove server defaults after adding columns
    op.alter_column('projects', 'name', server_default=None)
    op.alter_column('assets', 'original_filename', server_default=None)
    op.alter_column('assets', 'status', server_default=None)
    op.alter_column('assets', 'preview_image_count', server_default=None)
    op.alter_column('chunks', 'chunk_index', server_default=None)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_chunk_page_number', table_name='chunks')
    op.drop_index('ix_asset_content_hash', table_name='assets')
    op.drop_index('ix_asset_status', table_name='assets')
    
    # Drop columns from chunks
    op.drop_column('chunks', 'chunk_index')
    op.drop_column('chunks', 'page_number')
    
    # Drop columns from assets
    op.drop_column('assets', 'preview_image_count')
    op.drop_column('assets', 'content_hash')
    op.drop_column('assets', 'page_count')
    op.drop_column('assets', 'error_message')
    op.drop_column('assets', 'status')
    op.drop_column('assets', 'original_filename')
    
    # Drop columns from projects
    op.drop_column('projects', 'description')
    op.drop_column('projects', 'name')