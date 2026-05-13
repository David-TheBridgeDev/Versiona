import secrets
import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from database import get_db
import models, schemas, security, email_utils

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/request-verification", status_code=status.HTTP_200_OK)
def request_verification(data: schemas.EmailRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == data.email).first()
    
    # If user exists and is already verified AND has a password, they should login
    if db_user and db_user.is_verified and db_user.hashed_password:
        raise HTTPException(status_code=400, detail="Email already registered and verified")
    
    # Generate 6-digit verification code
    verification_code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
    
    if not db_user:
        # Create a temporary user record
        db_user = models.User(
            email=data.email,
            is_verified=False,
            verification_code=verification_code,
            verification_code_expires_at=expires_at
        )
        db.add(db_user)
    else:
        # Update existing unverified/incomplete user
        db_user.verification_code = verification_code
        db_user.verification_code_expires_at = expires_at
    
    db.commit()
    
    # Send verification email in the background
    background_tasks.add_task(email_utils.send_verification_email, db_user.email, verification_code)
    
    return {"message": "Verification code sent"}

@router.post("/verify-code", status_code=status.HTTP_200_OK)
def verify_code(data: schemas.VerifyCode, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_verified and user.hashed_password:
        return {"message": "Email already verified"}
    
    if user.verification_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    if user.verification_code_expires_at < datetime.datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code expired")
    
    user.is_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    db.commit()
    
    return {"message": "Email verified successfully"}

@router.post("/complete-registration", response_model=schemas.UserResponse)
def complete_registration(data: schemas.UserComplete, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not user.is_verified:
        raise HTTPException(status_code=400, detail="Email not verified")
    
    if user.hashed_password:
        raise HTTPException(status_code=400, detail="Registration already completed")
    
    user.full_name = data.full_name
    user.hashed_password = security.get_password_hash(data.password)
    db.commit()
    db.refresh(user)
    
    return user

@router.post("/resend-code", status_code=status.HTTP_200_OK)
def resend_code(email: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_verified and user.hashed_password:
        return {"message": "Email already verified"}
    
    # Generate new 6-digit verification code
    verification_code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
    
    user.verification_code = verification_code
    user.verification_code_expires_at = expires_at
    db.commit()
    
    # Send verification email in the background
    background_tasks.add_task(email_utils.send_verification_email, user.email, verification_code)
    
    return {"message": "Verification code resent"}

@router.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Legacy/standard register - might want to disable this if enforcing the new flow
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user and db_user.hashed_password:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = security.get_password_hash(user.password)
    
    if not db_user:
        new_user = models.User(
            email=user.email, 
            full_name=user.full_name,
            hashed_password=hashed_password,
            is_verified=False
        )
        db.add(new_user)
    else:
        db_user.full_name = user.full_name
        db_user.hashed_password = hashed_password
        new_user = db_user

    db.commit()
    db.refresh(new_user)
    
    return new_user

@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not user.hashed_password or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified"
        )
    
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

