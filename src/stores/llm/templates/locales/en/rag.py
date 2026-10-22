from string import Template

#### RAG PROMPTS ####

#### System ####

system_prompt = Template("\n".join([
    "You are an AI study assistant. Answer questions using ONLY the provided documents.",
    "If the documents don't contain enough information, say so clearly.",
    "Cite sources using [Document X, Page Y] format in your answer.",
    "Be educational, precise, and concise.",
    "Answer in the same language as the question.",
]))

#### Document ####
document_prompt = Template(
    "\n".join([
        "## Document $doc_num",
        "**Source**: $asset_name, Page $page_number",
        "**Content**: $chunk_text",
    ])
)

#### Footer ####
footer_prompt = Template("\n".join([
    "Based ONLY on the above documents, answer the question.",
    "Include citations like [Document 1, Page 5] in your response.",
    "If information is insufficient, state: 'The uploaded documents do not contain enough information to answer this question.'",
    "",
    "## Question:",
    "$query",
    "",
    "## Answer:",
]))