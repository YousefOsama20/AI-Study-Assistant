"""init commit

Creates the baseline projects/assets/chunks schema.

Revision ID: a599361d0859
Revises: 
Create Date: 2026-10-16 02:03:13.189941

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a599361d0859'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'projects',
        sa.Column('project_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('project_uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('project_id'),
        sa.UniqueConstraint('project_uuid'),
    )

    op.create_table(
        'assets',
        sa.Column('asset_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('asset_uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('asset_type', sa.String(), nullable=False),
        sa.Column('asset_name', sa.String(), nullable=False),
        sa.Column('asset_size', sa.Integer(), nullable=False),
        sa.Column('asset_config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('asset_project_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['asset_project_id'], ['projects.project_id']),
        sa.PrimaryKeyConstraint('asset_id'),
        sa.UniqueConstraint('asset_uuid'),
    )
    op.create_index('ix_asset_project_id', 'assets', ['asset_project_id'], if_not_exists=True)
    op.create_index('ix_asset_type', 'assets', ['asset_type'], if_not_exists=True)

    op.create_table(
        'chunks',
        sa.Column('chunk_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('chunk_uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chunk_text', sa.String(), nullable=False),
        sa.Column('chunk_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('chunk_order', sa.Integer(), nullable=False),
        sa.Column('chunk_project_id', sa.Integer(), nullable=False),
        sa.Column('chunk_asset_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['chunk_project_id'], ['projects.project_id']),
        sa.ForeignKeyConstraint(['chunk_asset_id'], ['assets.asset_id']),
        sa.PrimaryKeyConstraint('chunk_id'),
        sa.UniqueConstraint('chunk_uuid'),
    )
    op.create_index('ix_chunk_project_id', 'chunks', ['chunk_project_id'], if_not_exists=True)
    op.create_index('ix_chunk_asset_id', 'chunks', ['chunk_asset_id'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_chunk_asset_id', table_name='chunks', if_exists=True)
    op.drop_index('ix_chunk_project_id', table_name='chunks', if_exists=True)
    op.drop_table('chunks')

    op.drop_index('ix_asset_type', table_name='assets', if_exists=True)
    op.drop_index('ix_asset_project_id', table_name='assets', if_exists=True)
    op.drop_table('assets')

    op.drop_table('projects')
