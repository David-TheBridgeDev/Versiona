import models

def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to Versiona API", "status": "online"}

def test_register_user(client):
    user_data = {
        "email": "test@example.com",
        "password": "testpassword"
    }
    response = client.post("/auth/register", json=user_data)
    # Adjust based on your actual register endpoint behavior
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["email"] == user_data["email"]

def test_login_success(client, db_session):
    # Setup: register a user and verify them
    user_data = {"email": "login_success@example.com", "password": "password123"}
    client.post("/auth/register", json=user_data)

    user = db_session.query(models.User).filter(models.User.email == user_data["email"]).first()
    user.is_verified = True
    db_session.commit()

    # Test login
    login_data = {"username": user_data["email"], "password": user_data["password"]}
    response = client.post("/auth/login", data=login_data)

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_invalid_email(client):
    login_data = {"username": "nonexistent@example.com", "password": "password123"}
    response = client.post("/auth/login", data=login_data)

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

def test_login_invalid_password(client, db_session):
    # Setup
    user_data = {"email": "wrong_pass@example.com", "password": "password123"}
    client.post("/auth/register", json=user_data)

    user = db_session.query(models.User).filter(models.User.email == user_data["email"]).first()
    user.is_verified = True
    db_session.commit()

    # Test login with wrong password
    login_data = {"username": user_data["email"], "password": "wrongpassword"}
    response = client.post("/auth/login", data=login_data)

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

def test_login_not_verified(client):
    # Setup: register but don't verify
    user_data = {"email": "not_verified@example.com", "password": "password123"}
    client.post("/auth/register", json=user_data)

    # Test login
    login_data = {"username": user_data["email"], "password": user_data["password"]}
    response = client.post("/auth/login", data=login_data)

    assert response.status_code == 403
    assert response.json()["detail"] == "Email not verified"

def test_login_incomplete_registration(client, db_session):
    # Setup: user exists but has no hashed_password (e.g. only requested verification)
    email = "incomplete@example.com"
    user = models.User(email=email, is_verified=True, hashed_password=None)
    db_session.add(user)
    db_session.commit()

    # Test login
    login_data = {"username": email, "password": "anypassword"}
    response = client.post("/auth/login", data=login_data)

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"
