from .Provider import QdrantDB, PGVectorProvider
from .VectorDBEnums import VectorDBEnums
from controllers.BassController import BassController
from sqlalchemy.orm import sessionmaker

class VectorDBProviderFactory:

    def __init__(self, config, db_client:sessionmaker=None):
        self.config = config
        self.base_controller = BassController()
        self.db_client = db_client  

    def create(self, provider: str):
        
        if provider == VectorDBEnums.QDRANT.value:

            qdrant_db_client = self.base_controller.get_database_path(db_name = self.config.VECTOR_DB_PATH)

            return QdrantDB(
                db_client=qdrant_db_client,
                distance_method=self.config.VECTOR_DB_DISTANCE_METHOD,
                default_vector_size=self.config.EMBEDDING_MODEL_SIZE,
                index_threshold=self.config.VECTOR_DB_PGVEC_INDEX_THRESHOLD,
            )
        
        if provider == VectorDBEnums.PGVECTOR.value:
            return PGVectorProvider(
                db_client=self.db_client,
                distance_method=self.config.VECTOR_DB_DISTANCE_METHOD,
                default_vector_size=self.config.EMBEDDING_MODEL_SIZE,
                index_threshold=self.config.VECTOR_DB_PGVEC_INDEX_THRESHOLD,
            )
        
        return None