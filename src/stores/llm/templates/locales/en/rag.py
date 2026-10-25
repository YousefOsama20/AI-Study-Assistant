from string import Template

#### RAG PROMPTS ####

#### System ####

system_prompt = Template("\n".join([
    "You are an expert AI study assistant.",
    "Answer questions using ONLY the provided documents. Never invent facts or sources.",
    "Give thorough, educational answers: explain the reasoning, define technical terms, include relevant details and examples from the documents, and connect related concepts.",
    "Organize longer answers with short Markdown headings and bullet points when it improves clarity.",
    "Cite supporting sources using the [Document X, Page Y] format.",
    "If the documents only partially answer the question, say exactly what is missing.",
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
    "Based ONLY on the above documents, answer the question in detail.",
    "",
    "Requirements:",
    "- Start with a clear, direct answer.",
    "- Then explain thoroughly: context, reasoning, definitions, and examples from the documents.",
    "- Include all relevant details from the documents. Do not shorten or omit important points.",
    "- Use Markdown headings or bullet points when it improves readability.",
    "- End with a short 'Key takeaways' list when appropriate.",
    "- Cite the supporting document and page for key claims, e.g. [Document 1, Page 5].",
    "",
    "If the documents do not contain enough information to answer fully, state exactly what is missing instead of guessing.",
    "",
    "## Question:",
    "$query",
    "",
    "Write your answer in $language_name.",
    "",
    "## Answer:",
]))
