from unittest.mock import patch, MagicMock
from email_utils import send_verification_email
from config import settings

def test_send_verification_email_skips_when_no_password():
    # Ensure SMTP_PASSWORD is None
    with patch("config.settings.SMTP_PASSWORD", None):
        with patch("smtplib.SMTP") as mock_smtp:
            # We use a print capture or just check if SMTP was called
            send_verification_email("test@example.com", "123456")
            
            # SMTP should NOT have been called because config is incomplete
            mock_smtp.assert_not_called()

def test_send_verification_email_attempts_send_when_config_present():
    # Mock settings to have all values
    with patch("config.settings.SMTP_SERVER", "smtp.example.com"), \
         patch("config.settings.SMTP_PORT", 587), \
         patch("config.settings.SMTP_USER", "user@example.com"), \
         patch("config.settings.SMTP_PASSWORD", "securepassword"), \
         patch("config.settings.EMAIL_FROM", "noreply@example.com"):
        
        with patch("smtplib.SMTP") as mock_smtp_class:
            mock_smtp_instance = MagicMock()
            mock_smtp_class.return_value.__enter__.return_value = mock_smtp_instance
            
            send_verification_email("test@example.com", "123456")
            
            # SMTP should have been called
            mock_smtp_class.assert_called_with("smtp.example.com", 587)
            mock_smtp_instance.starttls.assert_called_once()
            mock_smtp_instance.login.assert_called_once_with("user@example.com", "securepassword")
            mock_smtp_instance.send_message.assert_called_once()
