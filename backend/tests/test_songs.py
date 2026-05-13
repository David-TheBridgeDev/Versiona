import pytest
from unittest.mock import patch

def test_create_song_unauthorized(client):
    response = client.post("/songs/")
    assert response.status_code == 401

@patch("tasks.process_audio.delay")
def test_create_song_success(mock_celery, client, db_session):
    # First, register and login to get a token
    user_data = {"email": "song@example.com", "password": "password"}
    client.post("/auth/register", json=user_data)
    
    # Manually verify user in DB since we need verified user
    import models
    user = db_session.query(models.User).filter(models.User.email == user_data["email"]).first()
    user.is_verified = True
    db_session.commit()

    # Login
    login_data = {"username": user_data["email"], "password": user_data["password"]}
    login_res = client.post("/auth/login", data=login_data)
    token = login_res.json()["access_token"]
    
    # Mocking the celery task ID
    mock_celery.return_value.id = "fake-task-id"

    # Create song
    song_file = ("test.mp3", b"fake-audio-content", "audio/mpeg")
    response = client.post(
        "/songs/",
        data={"quality_mode": "fast", "name": "Test Song"},
        files={"file": song_file},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["song"]["name"] == "Test Song"
    assert data["song"]["status"] == "pending"
    assert data["song"]["storage_path"] is not None
    assert mock_celery.called

def test_list_songs(client, db_session):
    # Reuse auth logic or create a helper
    user_data = {"email": "list@example.com", "password": "password"}
    client.post("/auth/register", json=user_data)
    import models
    user = db_session.query(models.User).filter(models.User.email == user_data["email"]).first()
    user.is_verified = True
    db_session.commit()
    
    login_data = {"username": user_data["email"], "password": user_data["password"]}
    login_res = client.post("/auth/login", data=login_data)
    token = login_res.json()["access_token"]

    # Create a song directly in DB for testing list
    db_song = models.Song(
        name="Existing Song",
        original_filename="test.mp3",
        user_id=user.id,
        quality_mode="fast"
    )
    db_session.add(db_song)
    db_session.commit()

    response = client.get("/songs/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "Existing Song"
