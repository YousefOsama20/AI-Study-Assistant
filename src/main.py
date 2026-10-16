from fastapi import FastAPI , APIRouter
from routes import base ,data, nlp
from helpers.config import get_settings
from stores.llm.LLMProviderFactory import LLMProviderFactory
from stores.vectordb.VectorDBProviderFactory import VectorDBProviderFactory    
from stores.llm.templates.template_perser import TemplateParser
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

print("MAIN.PY LOADED")

app = FastAPI()

@app.on_event("startup")
async def startup_db_client():
    setting = get_settings()

    postgres_conn = f"postgresql+asyncpg://{setting.POSTGRES_USERNAME}:{setting.POSTGRES_PASSWORD}@{setting.POSTGRES_HOST}:{setting.POSTGRES_PORT}/{setting.POSTGRES_MAIN_DATABASE}"
    
    app.db_engine = create_async_engine(postgres_conn)
    
    app.db_client = sessionmaker(
        app.db_engine, class_=AsyncSession, expire_on_commit=False
    )
    llm_provider_factory = LLMProviderFactory(setting)
    vectordb_provider_factory = VectorDBProviderFactory(setting)

    #generation client
    app.generation_client = llm_provider_factory.create(provider = setting.GENERATION_BACKEND)
    app.generation_client.set_generation_model(model_id = setting.GENERATION_MODEL_ID)

    #embedding client
    app.embedding_client = llm_provider_factory.create(provider = setting.EMBEDDING_BACKEND)
    app.embedding_client.set_embedding_model(model_id = setting.EMBEDDING_MODEL_ID,
                                            embedding_size = setting.EMBEDDING_MODEL_SIZE)    

    # vector db client
    app.vectordb_client = vectordb_provider_factory.create(
        provider=setting.VECTOR_DB_BACKEND
    )
    app.vectordb_client.connect()      

    app.template_parser = TemplateParser(
        language =setting.PRIMARY_LANG,
        default_language = setting.DEFAULT_LANG
    )

@app.on_event("shutdown")
async def shutdown_db_client():
    app.db_engine.dispose()
    app.vectordb_client.disconnect()

app.include_router(base.base_router)
app.include_router(data.data_router)
app.include_router(nlp.nlp_router)
 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
