# 🔍 LeaseSight

> **AI-Powered Lease Extraction, Audit & Compliance Platform**
>
> An enterprise-grade AI-powered Lease Extraction and Auditing platform built for modern commercial real estate, legal, and procurement teams. LeaseSight processes raw lease contracts, scores risks against a weighted compliance matrix, extracts visual bounding boxes mapped 1:1 to original PDF source text, and syncs critical obligation deadlines to your calendar.

---

## 🚀 Key Features

*   **Hybrid Client-Side & Server RAG Audit Engine**: Tokenizes and indexes extracted PDF layout lines using `minisearch` and BM25 scoring. Evaluates contract spans across key compliance categories (Governing Law, Termination & Default, Notice Periods, Liability Caps).
*   **Weighted Criticality Risk Matrix**: Evaluates contractual terms across Low (+1), Medium (+2), and Critical (+4) risk levels to calculate realistic risk scores with zero generic fallbacks.
*   **Direct PDF Document Grounding**: Interactive bounding box highlights (`#f59e0b` glowing amber overlays) positioned 1:1 over rendered PDF canvas text spans (`pdfjs-dist`).
*   **Flexible Compute & BYOK (Bring Your Own Key)**: Choose between high-speed managed Groq LPU inference or plug in custom Groq/OpenAI API keys stored locally in browser storage for zero-fee, local-first processing.
*   **Automated Stripe Payments & Credits System**: Integrated Stripe Payment Links for $5/mo Starter Subscriptions (25 audits/mo) and $5 Pay-As-You-Go top-ups (10 audit credits) with instant account credit syncing.
*   **Enterprise Briefing & Contact Engine**: Web3Forms-backed contact pipeline routing inquiries and briefing requests directly to `241475@students.au.edu.pk`.

---

## 🏗️ Architectural Overview

```mermaid
graph TD
    Client[Next.js Production Web App / leasesight-ui] -->|Browser RAG & BM25| LocalEngine[clientAuditEngine.ts & minisearch]
    Client -->|Local Storage BYOK| GroqSDK[Groq LPU Llama-3.3-70B API]
    Client -->|PDF Rendering & Bounding Boxes| PDFJS[pdfjs-dist Canvas & TextLayer]
    Client -->|Automated Checkout| Stripe[Stripe Payment Links]
    Client -->|Enterprise Inquiries| Web3Forms[Web3Forms API Engine]
    Client -->|Authentication| Clerk[Clerk Auth Provider]
    
    subgraph Optional Microservice / Cloud RAG
        API[FastAPI Server / Azure Document Intelligence] -->|Vector Search| Pinecone[Pinecone Vector DB]
    end
    
    Client -.->|Optional REST| API
