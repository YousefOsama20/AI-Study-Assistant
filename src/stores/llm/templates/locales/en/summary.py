from string import Template

#### PROJECT SUMMARY PROMPTS ####

#### Map (batch) ####

map_system_prompt = Template("\n".join([
    "You are an expert academic study assistant.",
    "Summarize the provided study material accurately and completely using only the provided content.",
    "Capture every main idea, argument, definition, formula, example, and conclusion.",
    "Keep source references that appear in the material, such as (file.pdf, p. 3).",
    "Write concise, well-structured study notes.",
]))

chunk_prompt = Template("\n".join([
    "### Document $doc_num: $asset_name — page $page_number",
    "$chunk_text",
]))

map_footer_prompt = Template("\n".join([
    "Summarize this batch of material into detailed study notes.",
    "Group related ideas, preserve key terminology and examples, and do not drop topics.",
    "Use bullet points. Keep any source and page references.",
    "Write the notes in $language_name.",
]))

#### Merge (hierarchical reduce) ####

merge_footer_prompt = Template("\n".join([
    "Merge the partial study notes below into one set of notes.",
    "Preserve every distinct idea, definition, example, and source reference.",
    "Remove only exact duplicates. Do not add information that is not present.",
    "Use Markdown headings and bullet points.",
    "Write the notes in $language_name.",
]))

#### Final synthesis ####

final_system_prompt = Template("\n".join([
    "You are an expert academic study assistant.",
    "Create a comprehensive summary of the ENTIRE project from the material provided.",
    "Use only the provided content. Never invent facts, definitions, or sources.",
    "Cover all documents and preserve source references such as (file.pdf, p. 3).",
]))

final_footer_prompt = Template("\n".join([
    "Produce a complete, well-structured project summary in Markdown with these sections:",
    "",
    "## Overview",
    "A short paragraph describing what the project and its material cover.",
    "",
    "## Main Ideas",
    "The most important ideas and arguments, with enough explanation to understand them.",
    "",
    "## Key Concepts and Definitions",
    "Important terms, formulas, or rules and their meaning.",
    "",
    "## Important Details and Examples",
    "Supporting details, examples, processes, and evidence from the documents.",
    "",
    "## Connections Between Topics",
    "How the ideas relate to each other.",
    "",
    "## Study Checklist",
    "5-10 items a student should review or be able to explain.",
    "",
    "Rules:",
    "- Cover all ideas in the material; do not omit whole topics.",
    "- Preserve citations such as (file.pdf, p. 3) where available.",
    "- Do not invent information.",
    "- Write the summary in $language_name.",
]))
