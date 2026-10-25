import asyncio
import logging
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .BassController import BassController
from models.db_schemes import Asset, DataChunk, Project


class SummaryController(BassController):

    def __init__(self, generation_client, template_parser=None):
        super().__init__()
        self.generation_client = generation_client
        self.template_parser = template_parser
        self.logger = logging.getLogger(__name__)

    async def summarize_project(
        self,
        project: Project,
        chunks: List[DataChunk],
        assets: List[Asset],
        language: str = None,
        force_refresh: bool = False,
        cache: Dict = None,
        locks: Dict = None,
    ) -> Optional[dict]:
        if not chunks:
            return None

        language = self.normalize_language(language)
        cache = cache if cache is not None else {}
        locks = locks if locks is not None else {}
        cache_key = (project.project_id, language)
        lock = locks.setdefault(cache_key, asyncio.Lock())

        signature = self._build_signature(chunks, language)
        max_chunks = max(1, int(self.app_setting.SUMMARY_MAX_CHUNKS or 1200))
        truncated = len(chunks) > max_chunks
        selected_chunks = chunks[:max_chunks]

        async with lock:
            if not force_refresh:
                cached = self._get_cached(cache, cache_key, signature)
                if cached is not None:
                    return {**cached, "cached": True}

            documents, asset_numbers = self._build_documents(selected_chunks, assets)
            blocks = self._build_chunk_blocks(selected_chunks, assets, asset_numbers, language)
            if not blocks:
                return None

            summary = await self._generate_summary(blocks, language)
            if not summary:
                return None

            entry = {
                "summary": summary,
                "documents": documents,
                "chunk_count": len(selected_chunks),
                "truncated": truncated,
                "language": language,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
            cache[cache_key] = {
                **entry,
                "signature": signature,
                "_cached_at": time.time(),
            }
            return {**entry, "cached": False}

    def _build_signature(self, chunks: List[DataChunk], language: str) -> str:
        max_chunk_id = max((chunk.chunk_id or 0) for chunk in chunks)
        return f"{len(chunks)}:{max_chunk_id}:{language}"

    def _get_cached(self, cache: Dict, cache_key, signature: str) -> Optional[dict]:
        entry = cache.get(cache_key)
        if not entry or entry.get("signature") != signature:
            return None

        ttl = int(self.app_setting.SUMMARY_CACHE_TTL_SECONDS or 0)
        if ttl > 0 and time.time() - entry.get("_cached_at", 0) > ttl:
            cache.pop(cache_key, None)
            return None

        return {key: value for key, value in entry.items() if not key.startswith("_") and key != "signature"}

    def _build_documents(self, chunks: List[DataChunk], assets: List[Asset]):
        assets_by_id = {asset.asset_id: asset for asset in assets}
        chunk_counts = Counter()
        pages = defaultdict(list)
        ordered_asset_ids = []

        for chunk in chunks:
            asset_id = chunk.chunk_asset_id
            if asset_id not in chunk_counts:
                ordered_asset_ids.append(asset_id)
            chunk_counts[asset_id] += 1
            if chunk.page_number is not None:
                pages[asset_id].append(chunk.page_number)

        documents = []
        for asset_id in ordered_asset_ids:
            asset = assets_by_id.get(asset_id)
            page_values = pages.get(asset_id, [])
            filename = None
            if asset is not None:
                filename = asset.original_filename or asset.asset_name
            documents.append({
                "document_id": asset_id,
                "filename": filename or f"Document {asset_id}",
                "page_count": asset.page_count if asset is not None else None,
                "chunk_count": chunk_counts[asset_id],
                "first_page": min(page_values) if page_values else None,
                "last_page": max(page_values) if page_values else None,
            })

        asset_numbers = {
            asset_id: index + 1
            for index, asset_id in enumerate(ordered_asset_ids)
        }
        return documents, asset_numbers

    def _build_chunk_blocks(
        self,
        chunks: List[DataChunk],
        assets: List[Asset],
        asset_numbers: Dict[int, int],
        language: str,
    ) -> List[str]:
        assets_by_id = {asset.asset_id: asset for asset in assets}
        blocks = []

        for chunk in chunks:
            text = (chunk.chunk_text or "").strip()
            if not text:
                continue

            asset = assets_by_id.get(chunk.chunk_asset_id)
            filename = None
            if asset is not None:
                filename = asset.original_filename or asset.asset_name

            block = self.template_parser.get(
                "summary",
                "chunk_prompt",
                {
                    "doc_num": asset_numbers.get(chunk.chunk_asset_id, chunk.chunk_asset_id),
                    "asset_name": filename or f"Document {chunk.chunk_asset_id}",
                    "page_number": chunk.page_number if chunk.page_number is not None else "N/A",
                    "chunk_text": text,
                },
                language=language,
            )
            if block:
                blocks.append(block)

        return blocks

    async def _generate_summary(self, blocks: List[str], language: str) -> Optional[str]:
        single_pass_max = max(1000, int(self.app_setting.SUMMARY_SINGLE_PASS_MAX_CHARS or 80000))
        total_chars = sum(len(block) + 2 for block in blocks)
        final_system = self.template_parser.get(
            "summary", "final_system_prompt", language=language
        )
        final_footer = self.template_parser.get(
            "summary",
            "final_footer_prompt",
            {"language_name": self.language_name(language)},
            language=language,
        )

        if total_chars <= single_pass_max:
            prompt = "\n\n".join(blocks) + "\n\n" + final_footer
            return await self._generate(
                prompt=prompt,
                system_prompt=final_system,
                max_output_tokens=int(self.app_setting.SUMMARY_MAX_OUTPUT_TOKENS or 2000),
            )

        batch_max = max(1000, int(self.app_setting.SUMMARY_BATCH_MAX_CHARS or 40000))
        batches = self._group_by_chars(blocks, batch_max)
        map_system = self.template_parser.get(
            "summary", "map_system_prompt", language=language
        )
        map_footer = self.template_parser.get(
            "summary",
            "map_footer_prompt",
            {"language_name": self.language_name(language)},
            language=language,
        )

        partials = []
        for index, batch in enumerate(batches, start=1):
            prompt = "\n\n".join(batch) + "\n\n" + map_footer
            partial = await self._generate(
                prompt=prompt,
                system_prompt=map_system,
                max_output_tokens=int(self.app_setting.SUMMARY_MAP_MAX_OUTPUT_TOKENS or 700),
            )
            if partial:
                partials.append(partial)
            else:
                self.logger.error(
                    "Summary map call failed for batch %s/%s", index, len(batches)
                )

        if not partials:
            return None

        merged_notes = await self._merge_notes(partials, language)
        if not merged_notes:
            return None

        prompt = merged_notes + "\n\n" + final_footer
        return await self._generate(
            prompt=prompt,
            system_prompt=final_system,
            max_output_tokens=int(self.app_setting.SUMMARY_MAX_OUTPUT_TOKENS or 2000),
        )

    async def _merge_notes(self, partials: List[str], language: str) -> Optional[str]:
        if len(partials) == 1:
            return partials[0]

        reduce_max = max(1000, int(self.app_setting.SUMMARY_REDUCE_MAX_CHARS or 60000))
        current = partials

        while len(current) > 1 and sum(len(part) + 2 for part in current) > reduce_max:
            groups = self._group_by_chars(current, reduce_max)
            if len(groups) >= len(current):
                break

            merged = []
            for group in groups:
                if len(group) == 1:
                    merged.append(group[0])
                    continue
                result = await self._merge_group(group, language)
                if not result:
                    return None
                merged.append(result)
            current = merged

        if len(current) == 1:
            return current[0]
        return await self._merge_group(current, language)

    async def _merge_group(self, group: List[str], language: str) -> Optional[str]:
        merge_footer = self.template_parser.get(
            "summary",
            "merge_footer_prompt",
            {"language_name": self.language_name(language)},
            language=language,
        )
        map_system = self.template_parser.get(
            "summary", "map_system_prompt", language=language
        )
        prompt = "\n\n".join(group) + "\n\n" + merge_footer
        return await self._generate(
            prompt=prompt,
            system_prompt=map_system,
            max_output_tokens=int(self.app_setting.SUMMARY_MAP_MAX_OUTPUT_TOKENS or 700),
        )

    def _group_by_chars(self, blocks: List[str], max_chars: int) -> List[List[str]]:
        groups = []
        current = []
        size = 0

        for block in blocks:
            if current and size + len(block) + 2 > max_chars:
                groups.append(current)
                current = []
                size = 0
            current.append(block)
            size += len(block) + 2

        if current:
            groups.append(current)
        return groups

    async def _generate(
        self,
        prompt: str,
        system_prompt: str,
        max_output_tokens: int,
    ) -> Optional[str]:
        messages = [
            self.generation_client.construct_prompt(
                prompt=system_prompt,
                role=self.generation_client.enums.SYSTEM.value,
            )
        ]

        answer = await asyncio.to_thread(
            self.generation_client.generate_text,
            prompt=prompt,
            chat_history=messages,
            max_output_tokens=max_output_tokens,
            temperature=self.app_setting.GENERATION_DAFAULT_TEMPERATURE,
        )

        if not answer:
            return None
        return str(answer).strip()
