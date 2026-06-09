# LiveEdit Architecture Diagram

```mermaid
flowchart LR
    U[User Browser]

    subgraph FE[Frontend]
      F1[React + TypeScript SPA\nCloud Run: liveedit-frontend]
      F2[Workflow Canvas\nDirector Chat Panel]
    end

    subgraph BE[Backend API]
      B1[Flask API\nCloud Run: liveedit-backend]
      B2[Video Director Service\nSession + Plan + Render]
      B3[Video Ingestion Service\nUpload + Analyze + Query]
      B4[Celery Tasks\nAsync Analyze/Edit]
    end

    subgraph GCP[Google Cloud]
      G1[Vertex AI Gemini\nText + Video Models]
      G2[Cloud Storage Bucket\nVideo Objects]
      G3[Cloud Logging]
    end

    subgraph DATA[Data Stores]
      D1[(Neon PostgreSQL)]
      D2[(Upstash Redis)]
    end

    subgraph EXT[External Services]
      E1[Paystack]
    end

    U --> F1
    F1 --> F2
    F2 -->|HTTPS /api| B1

    B1 --> B2
    B1 --> B3
    B1 --> B4

    B3 -->|Upload/Read media| G2
    B3 -->|Generate content| G1
    B2 -->|Conversation + planning| G1

    B1 -->|User, jobs, media metadata| D1
    B2 -->|Session persistence| D2
    B4 -->|Job state + blobs| D1

    B1 -->|Payment init/verify| E1
    B1 --> G3

    classDef cloud fill:#0b3d91,color:#fff,stroke:#0b3d91;
    classDef app fill:#1f2937,color:#fff,stroke:#111827;
    classDef data fill:#14532d,color:#fff,stroke:#14532d;
    classDef ext fill:#7c2d12,color:#fff,stroke:#7c2d12;

    class G1,G2,G3 cloud;
    class F1,F2,B1,B2,B3,B4 app;
    class D1,D2 data;
    class E1 ext;
```

## Export to image (for submission)
1. Open https://mermaid.live
2. Paste the Mermaid block above
3. Click Actions → Download PNG
4. Upload as: `liveedit-architecture.png`
