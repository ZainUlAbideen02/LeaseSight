import os, sys
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, "api", ".env"), override=True)
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

print("--- GROQ TEST ---")
from scripts.groq_client import GroqChatClient
groq_key = os.getenv("GROQ_API_KEY")
print("Key length:", len(groq_key) if groq_key else 0)
client = GroqChatClient(api_key=groq_key)
print("Groq response:", client.smoke_test())

print("--- PINECONE TEST ---")
from pinecone import Pinecone
pc_key = os.getenv("PINECONE_API_KEY")
print("Pinecone key length:", len(pc_key) if pc_key else 0)
pc = Pinecone(api_key=pc_key)
indexes = pc.list_indexes()
print("Indexes:", [idx.name for idx in indexes])
