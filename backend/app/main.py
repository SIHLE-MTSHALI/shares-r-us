from fastapi import FastAPI
from .api import users

app = FastAPI()

app.include_router(users.router)

@app.get("/")
async def root():
    return {"message": "Welcome to Shares'R'Us API"}
