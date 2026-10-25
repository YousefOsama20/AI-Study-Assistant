from .BassController import BassController
from models.db_schemes import Project, DataChunk, RetrievedDocument
from stores.llm.LLMEnums import DocumentTypeEnum
from typing import List, Optional
import asyncio
import json

class NLPController(BassController):

    def __init__(self, generation_client, embedding_client, vectordb_client, template_parser=None):
        super().__init__()
        self.generation_client = generation_client
        self.embedding_client = embedding_client
        self.vectordb_client = vectordb_client
        self.template_parser = template_parser

    @classmethod
    async def create_instance(cls, vectordb_client, embedding_client, generation_client):
        return cls(
            generation_client=generation_client,
            embedding_client=embedding_client,
            vectordb_client=vectordb_client,
        )

    def create_collection_name(self, project_id):
        return f"collection_{self.vectordb_client.default_vector_size}_{project_id}".strip()
  
    async def reset_vector_db_collection(self, project: Project):
        collection_name = self.create_collection_name(project.project_id)
        return await self.vectordb_client.delete_collection(collection_name=collection_name)
         
    async def get_vector_db_collection_info(self, project: Project):
        collection_name = self.create_collection_name(project.project_id)
        collection_info = await self.vectordb_client.get_collection_info(collection_name=collection_name)
        if collection_info is None:
            return None
        return json.loads(
            json.dumps(collection_info, default=lambda x: x.__dict__)
        )

    async def delete_chunks_vectors(self, project: Project, chunk_ids: List[int]):
        """Delete vectors for the given chunk IDs. Safe when nothing exists yet."""
        if not chunk_ids:
            return True
        collection_name = self.create_collection_name(project.project_id)
        try:
            if not await self.vectordb_client.is_collection_exists(collection_name=collection_name):
                return True
            return await self.vectordb_client.delete_records_by_ids(
                collection_name=collection_name,
                record_ids=chunk_ids,
            )
        except Exception:
            return True

    async def index_into_vector_db(self, project: Project, chunks: List[DataChunk],
                                    chunk_ids: List[int],
                                    asset_names: dict[int, str],
                                    original_filenames: dict[int, str],
                                    do_reset: bool = False,
                                    asset_uuids: dict[int, str] = None):
        # step1: get collection name
        collection_name = self.create_collection_name(project.project_id)

        # step2: manage items
        texts = [c.chunk_text for c in chunks]
        
        # Build metadata with page numbers and asset info
        asset_uuids = asset_uuids or {}
        metadata = []
        for chunk in chunks:
            asset_id = chunk.chunk_asset_id
            meta = {
                "asset_id": asset_id,
                "asset_uuid": asset_uuids.get(asset_id, ""),
                "asset_name": asset_names.get(asset_id, ""),
                "original_filename": original_filenames.get(asset_id, ""),
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
                "chunk_id": chunk.chunk_id
            }
            metadata.append(meta)

        vectors = self.embedding_client.embed_text(
                text=texts, 
                document_type=DocumentTypeEnum.DOCUMENT.value
            )

        # step3: create collection if not exists
        _ = await self.vectordb_client.create_collection(
            collection_name=collection_name,
            embedding_size=self.embedding_client.embedding_size,
            do_reset=do_reset
        )
        
        # step4: insert into vector db
        _ = await self.vectordb_client.insert_many(
            collection_name=collection_name,
            texts=texts,
            vectors=vectors,
            metadata=metadata,
            record_ids=chunk_ids,
        )

        return True

    async def search_vector_db_collection(self, project: Project, text: str, limit: int = 10, 
                                           similarity_threshold: float = None):
        # step1: get collection name
        query_vector = None
        collection_name = self.create_collection_name(project_id=project.project_id)

        # step2: get text embedding vector
        vectors = self.embedding_client.embed_text(text=text, 
                                                 document_type=DocumentTypeEnum.QUERY.value)

        if not vectors or len(vectors) == 0:
            return False

        if isinstance(vectors, list) and len(vectors) > 0:
            query_vector = vectors[0]

        if not query_vector:
            self.logger.error("Error while embedding text")
            return False

        # step3: do semantic search
        results = await self.vectordb_client.search_by_vector(
            collection_name=collection_name,
            vector=query_vector,
            limit=limit
        )

        if results is False or results is None:
            return False

        # Filter by similarity threshold if provided
        if similarity_threshold is not None:
            results = [r for r in results if r.score >= similarity_threshold]

        # Convert to SearchResult format with metadata
        search_results = []
        for result in results:
            meta = result.metadata if getattr(result, "metadata", None) else {}
            search_results.append({
                "text": result.text,
                "score": result.score,
                "asset_id": meta.get("asset_id"),
                "asset_uuid": meta.get("asset_uuid", ""),
                "asset_name": meta.get("asset_name", ""),
                "original_filename": meta.get("original_filename", ""),
                "page_number": meta.get("page_number"),
                "chunk_index": meta.get("chunk_index", 0),
                "chunk_id": meta.get("chunk_id", getattr(result, "chunk_id", None))
            })

        return search_results
     
    async def answer_rag_question(self, project: Project, query: str, limit: int = None,
                                   chat_history: List[dict] = None, language: str = None):

        answer, full_prompt, updated_chat_history = None, None, None

        language = self.normalize_language(language)
        answer_language = self.language_name(language)
        limit = int(limit or self.app_setting.RAG_ANSWER_LIMIT or 10)
        context_max_chars = int(self.app_setting.RAG_CONTEXT_MAX_CHARS or 20000)
        chunk_max_chars = int(self.app_setting.RAG_CHUNK_MAX_CHARS or 2000)

        # step1: retrieve related documents
        retrieved_documents = await self.search_vector_db_collection(
            project=project,
            text=query,
            limit=limit,
        )

        if not retrieved_documents or len(retrieved_documents) == 0:
            return answer, full_prompt, chat_history or [], []

        # Keep chunks until the context budget is reached. The first chunk is
        # always kept, even when it alone exceeds the budget.
        included_documents = []
        used_chars = 0
        for doc in retrieved_documents:
            text = (doc.get("text") or "").strip()
            if not text:
                continue
            text = text[:chunk_max_chars]
            if included_documents and used_chars + len(text) > context_max_chars:
                break
            included_documents.append({**doc, "text": text})
            used_chars += len(text) + 2

        if not included_documents:
            return None, None, chat_history or [], []

        # Build citations from the chunks that actually enter the prompt.
        citations = []
        for doc in included_documents:
            citations.append({
                "asset_id": doc.get("asset_id"),
                "asset_uuid": doc.get("asset_uuid", ""),
                "asset_name": doc.get("asset_name"),
                "original_filename": doc.get("original_filename", ""),
                "page_number": doc.get("page_number"),
                "chunk_text": doc.get("text", "")[:500],
                "score": doc.get("score", 0.0),
                "chunk_index": doc.get("chunk_index", 0),
                "chunk_id": doc.get("chunk_id")
            })

        # step2: Construct LLM prompt with detailed-answer instructions
        system_prompt = self.template_parser.get(
            "rag", "system_prompt", language=language
        )

        documents_prompts = "\n".join([
            self.template_parser.get(
                "rag",
                "document_prompt",
                {
                    "doc_num": idx + 1,
                    "chunk_text": doc.get("text", ""),
                    "asset_name": doc.get("original_filename") or doc.get("asset_name") or "",
                    "page_number": doc.get("page_number") if doc.get("page_number") is not None else "N/A"
                },
                language=language,
            )
            for idx, doc in enumerate(included_documents)
        ])

        footer_prompt = self.template_parser.get(
            "rag",
            "footer_prompt",
            {
                "query": query,
                "language_name": answer_language,
            },
            language=language,
        )

        # step3: Construct Generation Client Prompts
        chat_history = chat_history or []

        messages = [
            self.generation_client.construct_prompt(
                prompt=system_prompt,
                role=self.generation_client.enums.SYSTEM.value,
            )
        ]

        history_limit = max(1, int(self.app_setting.RAG_HISTORY_MESSAGES or 8))
        history_max_chars = max(200, int(self.app_setting.RAG_HISTORY_MESSAGE_MAX_CHARS or 2000))
        recent_history = chat_history[-history_limit:]
        for msg in recent_history:
            raw_role = str(msg.get("role", "user")).lower()
            if raw_role in ("assistant", "ai", "chatbot", "model"):
                provider_role = self.generation_client.enums.ASSISTANT.value
            else:
                provider_role = self.generation_client.enums.USER.value

            content = str(msg.get("content", ""))
            if len(content) > history_max_chars:
                content = content[:history_max_chars] + "..."

            messages.append(self.generation_client.construct_prompt(
                prompt=content,
                role=provider_role
            ))

        full_prompt = "\n\n".join([documents_prompts, footer_prompt])

        # step4: Retrieve the detailed answer without blocking the event loop
        answer = await asyncio.to_thread(
            self.generation_client.generate_text,
            prompt=full_prompt,
            chat_history=messages,
            max_output_tokens=int(self.app_setting.RAG_MAX_OUTPUT_TOKENS or 1500),
            temperature=self.app_setting.GENERATION_DAFAULT_TEMPERATURE,
        )

        if answer:
            answer = str(answer).strip()

        # Update chat history with current exchange
        updated_chat_history = chat_history + [
            {"role": "user", "content": query},
            {"role": "assistant", "content": answer}
        ]

        return answer, full_prompt, updated_chat_history, citations