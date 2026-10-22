from .BaseDataModel import BaseDataModel
from .db_schemes import Asset
from .enums.DataBaseEnum import DataBaseEnum
from sqlalchemy.future import select
from sqlalchemy import delete

class AssetModel(BaseDataModel):

    def __init__(self, db_client: object):
        super().__init__(db_client=db_client)
        self.db_client = self.db_client

    @classmethod
    async def create_instance(cls, db_client: object):
        instance = cls(db_client)
        return instance 

    async def create_asset(self, asset: Asset):

        async with self.db_client() as session:
            session.add(asset)
            await session.commit()
            await session.refresh(asset)
        return asset

    async def get_all_project_assets(self, asset_project_id: int, asset_type: str):

        async with self.db_client() as session:
            stmt = select(Asset).where(
                Asset.asset_project_id == asset_project_id,
                Asset.asset_type == asset_type
            )
            result = await session.execute(stmt)
            records = result.scalars().all()
        return records

    async def get_asset_record(self, asset_project_id: int, asset_name: str):

        async with self.db_client() as session:
            stmt = select(Asset).where(
                Asset.asset_project_id == asset_project_id,
                Asset.asset_name == asset_name
            )
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
        return record

    async def get_asset_by_id(self, asset_id: int):

        async with self.db_client() as session:
            stmt = select(Asset).where(Asset.asset_id == asset_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
        return record

    async def delete_asset(self, asset_id: int):
        async with self.db_client() as session:
            stmt = delete(Asset).where(Asset.asset_id == asset_id)
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount > 0

    async def update_asset_status(self, asset_id: int, status: str, error_message: str = None, page_count: int = None, preview_image_count: int = None):
        async with self.db_client() as session:
            stmt = select(Asset).where(Asset.asset_id == asset_id)
            result = await session.execute(stmt)
            asset = result.scalar_one_or_none()
            if asset:
                asset.status = status
                if error_message is not None:
                    asset.error_message = error_message
                if page_count is not None:
                    asset.page_count = page_count
                if preview_image_count is not None:
                    asset.preview_image_count = preview_image_count
                await session.commit()
                await session.refresh(asset)
                return asset
        return None
