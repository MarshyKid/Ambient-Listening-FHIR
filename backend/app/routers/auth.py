from fastapi import APIRouter, Request, Response
import json
from os import environ as env
from urllib.parse import urlparse

from auth0_server_python.auth_server.server_client import ServerClient
from auth0_server_python.auth_types import (
    LogoutOptions,
    StartInteractiveLoginOptions,
    StateData,
    TransactionData
)
from auth0_server_python.store.abstract import AbstractDataStore
from dotenv import load_dotenv
from fastapi.responses import RedirectResponse, JSONResponse
import truststore
truststore.inject_into_ssl()

router = APIRouter(prefix="/api/auth", tags=["auth"])
load_dotenv()

class CookieStore(AbstractDataStore):
    def __init__(self, secret, cookie_name, max_age, model):
        super().__init__({"secret": secret})
        self.cookie_name = cookie_name
        self.max_age = max_age
        self.model = model

    async def set(self, identifier, state, **kwargs):
        options = kwargs.get("options")
        response: Response = options.get("response")

        data = state.model_dump() if hasattr(state, "model_dump") else state
        response.set_cookie(
            key=self.cookie_name,
            value=self.encrypt(identifier, data),
            httponly=True,
            samesite="lax",
            secure=not env.get("APP_BASE_URL", "").startswith("http://"),
            max_age=self.max_age,
        )

    async def get(self, identifier, options=None):
        try:
            request: Request = options["request"]
            encrypted = request.cookies.get(self.cookie_name)
            return self.model.model_validate(self.decrypt(identifier, encrypted)) if encrypted else None
        except Exception:
            return None

    async def delete(self, *_, **kwargs):
        options = kwargs.get("options")
        response: Response = options.get("response")
        response.delete_cookie(self.cookie_name)

def auth0():
    session_secret = env["AUTH0_SECRET"]

    return ServerClient(
        domain=env["AUTH0_DOMAIN"],
        client_id=env["AUTH0_CLIENT_ID"],
        client_secret=env["AUTH0_CLIENT_SECRET"],
        redirect_uri=env["APP_BASE_URL"] + "/api/auth/callback",
        authorization_params={
            "scope": "openid profile email",
        },
        secret=session_secret,
        state_store=CookieStore(session_secret, "_a0_session", 259200, StateData),
        transaction_store=CookieStore(session_secret, "_a0_tx", 300, TransactionData)
    )

@router.get("/login")
async def login(request: Request):
    response = RedirectResponse(url="/")

    url = await auth0().start_interactive_login(
        options=StartInteractiveLoginOptions(
            authorization_params=dict(request.query_params)
        ),
        store_options={
            "request": request,
            "response": response,
        }
    )

    response.headers["location"] = url
    return response

@router.get("/callback")
async def callback(request: Request):
    response = RedirectResponse(url="http://localhost:5173/")

    await auth0().complete_interactive_login(
        url=str(request.url),
        store_options={
            "request": request,
            "response": response,
        },
    )

    return response

@router.post("/logout")
async def logout(request: Request):
    response = RedirectResponse(url="http://localhost:5173/")

    url = await auth0().logout(
        options=LogoutOptions(return_to="http://localhost:5173/"),
        store_options={
            "request": request,
            "response": response,
        },
    )

    response.headers["location"] = url
    return response

@router.get("/me")
async def me(request: Request):
    user = await auth0().get_user(
        {
            "request": request,
        }
    )

    if not user:
        return {"authenticated": False}

    return {
        "authenticated": True,
        "user": user
    }