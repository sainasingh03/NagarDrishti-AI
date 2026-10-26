import os
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import User

SECRET = os.getenv("JWT_SECRET", "local-only-change-this-secret-before-deploying")
ALGORITHM = "HS256"
pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

def hash_password(value): return pwd.hash(value)
def verify_password(value, hashed): return pwd.verify(value, hashed)
def issue_token(user):
    exp = datetime.now(timezone.utc) + timedelta(minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "60")))
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, SECRET, algorithm=ALGORITHM)

def _user_from_credentials(creds, db):
    if not creds: raise HTTPException(401, "Sign in to continue")
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, ValueError, KeyError): raise HTTPException(401, "Invalid or expired session")
    user = db.get(User, user_id)
    if not user: raise HTTPException(401, "Account no longer exists")
    return user

def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)):
    return _user_from_credentials(creds, db)

def optional_user(creds: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)):
    if not creds: return None
    return _user_from_credentials(creds, db)

def require_roles(*roles):
    def check(user: User = Depends(current_user)):
        if user.role not in roles: raise HTTPException(403, "This action requires an authorized role")
        return user
    return check
