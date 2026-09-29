import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import route handlers
from app.api.datasets import router as datasets_router
from app.api.analysis import router as analysis_router
from app.api.llm import router as llm_router

# Initialize FastAPI application
app = FastAPI(
    title="DataPilot API",
    description="Autonomous Agentic AI Data Analyst powered by DuckDB OLAP",
    version="0.1.0",
)

# Configure CORS middleware to permit frontend Vite development (localhost:5173 / 127.0.0.1:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers under /api/v1 prefix
app.include_router(datasets_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1")
app.include_router(llm_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "DataPilot OLAP Engine",
        "version": "0.1.0",
        "endpoints": {
            "datasets": "/api/v1/datasets",
            "analysis": "/api/v1/analysis",
            "llm": "/api/v1/llm",
            "docs": "/docs",
        },
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "duckdb": "ready",
    }