import time
print("Importing sentence_transformers...")
t0 = time.time()
from sentence_transformers import SentenceTransformer
print(f"Imported in {time.time()-t0:.2f}s")

print("Loading all-mpnet-base-v2 model...")
t1 = time.time()
model = SentenceTransformer("all-mpnet-base-v2")
print(f"Loaded in {time.time()-t1:.2f}s")

vec = model.encode("hello world")
print(f"Vector shape: {vec.shape}")
