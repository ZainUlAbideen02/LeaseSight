import os

with open('api/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

chat_endpoint = '''
@app.post("/api/v1/chat")
@app.post("/api/chat")
async def chat_endpoint(request: Request, keys: AuthKeys = Depends(get_api_keys)):
    try:
        payload = await request.json()
        query = payload.get("query", "")
        file_name = payload.get("file_name", "")
        user_id = payload.get("user_id") or request.headers.get("X-User-Id") or "default_user"

        if not query or not file_name:
            raise HTTPException(status_code=400, detail="query and file_name are required")

        try:
            gemini_client = GeminiChatClient(api_key=keys.openai_key)
        except Exception as e:
            gemini_client = None

        try:
            pc = Pinecone(api_key=keys.pinecone_key)
            index = pc.Index("leasesight-index")
        except Exception as e:
            index = None

        context = ""
        if index:
            try:
                vec = get_local_embedding(query)
                results = retrieve_dual_namespace(index, vec, top_k=5, file_name=file_name, user_id=user_id, include_metadata=True)
                if results.get("matches"):
                    context = "\\n".join([m["metadata"].get("text", "") for m in results["matches"]])
            except Exception as e:
                print(f"[CHAT] Pinecone retrieval failed: {e}")

        if not context:
            context = _context_from_json_map(file_name)

        if not gemini_client:
            return {
                "answer": f"[Fallback Mode] The external AI service is unavailable. Here is the closest matching text from the document:\\n\\n{context[:1000]}...",
                "source_text": context[:1000],
                "page": 1,
                "annotation": None
            }

        chat_prompt = f"""You are a Senior Legal Analyst assisting with a document query.
Your knowledge must be mapped strictly to the 20-point comprehensive matrix:
1. CORE ENTITY & METADATA
2. CHRONOLOGICAL LIFECYCLE
3. FINANCIALS, FEES & REVENUE
4. RISK, COMPLIANCE & LEGAL TRAPS
5. RESTRICTIONS, SCOPE & GOVERNANCE

CRITICAL RULE: Strip structural headers (e.g., 'ARTICLE 10') from Governing Law and Venue, returning only the location.
Answer the following query based ONLY on this context. Keep the answer professional and concise.
Context: {context[:15000]}
"""
        try:
            answer = gemini_client.complete(chat_prompt, query, "CHAT_AGENT")
        except Exception as e:
            answer = f"[Fallback Mode] The external AI service threw an error ({e}). Here is the closest matching text:\\n\\n{context[:1000]}..."

        return {
            "answer": answer,
            "source_text": context[:1000],
            "page": 1,
            "annotation": None
        }

    except Exception as e:
        return {
            "answer": f"[Fallback Error] The system encountered a failure: {e}",
            "source_text": None,
            "page": None,
            "annotation": None
        }
'''

if '@app.post("/api/chat")' not in content:
    content = content.replace('@app.post("/api/v1/audit")', chat_endpoint + '\n@app.post("/api/v1/audit")')
    with open('api/main.py', 'w', encoding='utf-8') as f:
        f.write(content)
