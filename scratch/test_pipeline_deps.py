import os, sys
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, "api", ".env"), override=True)
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

print("--- TESTING GROQ ---")
from scripts.groq_client import GroqChatClient
groq_key = os.getenv("GROQ_API_KEY")
print(f"GROQ_API_KEY present: {bool(groq_key)}")
try:
    groq = GroqChatClient(api_key=groq_key)
    res = groq.smoke_test()
    print(f"Groq smoke test result: {res}")
except Exception as e:
    print(f"Groq test failed: {e}")

print("\n--- TESTING PINECONE ---")
from pinecone import Pinecone
pc_key = os.getenv("PINECONE_API_KEY")
print(f"PINECONE_API_KEY present: {bool(pc_key)}")
try:
    pc = Pinecone(api_key=pc_key)
    indexes = pc.list_indexes()
    print(f"Pinecone indexes: {[idx.name for idx in indexes]}")
except Exception as e:
    print(f"Pinecone test failed: {e}")

print("\n--- TESTING LOCAL EMBEDDING ---")
try:
    from scripts.processor import get_local_embedding
    emb = get_local_embedding("test sentence")
    print(f"Embedding length: {len(emb)}")
except Exception as e:
    print(f"Local embedding failed: {e}")
