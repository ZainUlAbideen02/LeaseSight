import os
import dotenv
from pinecone import Pinecone

dotenv.load_dotenv()
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
idx = pc.Index("leasesight-index")

filt = {
    "$or": [
        {"file_name": {"$eq": "Land_Lease_Agreement_Milwaukee.pdf"}},
        {"filename": {"$eq": "Land_Lease_Agreement_Milwaukee.pdf"}}
    ]
}

res = idx.query(
    vector=[0.0]*768,
    top_k=5,
    filter=filt,
    namespace="academic_baseline",
    include_metadata=True
)

print("Matches found:", len(res.get("matches", [])))
for m in res.get("matches", []):
    print(m.get("id"), m.get("metadata", {}).get("file_name"))
